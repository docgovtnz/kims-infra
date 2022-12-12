import * as cdk from 'aws-cdk-lib';
import {Duration, Stack} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Effect} from 'aws-cdk-lib/aws-iam';
import {MyStackProps} from '../bin/kims-infra';
import {ISecurityGroup, ISubnet} from 'aws-cdk-lib/aws-ec2';

export class KimsServerStack extends Stack {
    constructor(scope: Construct, id: string, props: MyStackProps) {
        super(scope, id, props);

        // Only do this bit if the environment is prod, other environments have their meta files managed manually
        if(process.env.ENV_NAME === 'prod') {
            // Copy the meta files into the meta bucket
            const metaBucket = cdk.aws_s3.Bucket.fromBucketName(this, 'MetaBucket', props.serverEnvMap.META_BUCKET_NAME);
            const metaFilesDeployment = new cdk.aws_s3_deployment.BucketDeployment(this, 'MetaFiles', {
                sources: [cdk.aws_s3_deployment.Source.asset(`env/${process.env.ENV_NAME}/meta`)],
                destinationBucket: metaBucket,
                destinationKeyPrefix: `meta`
            });
        }

        const lambdaFunctionName = props.serverEnvMap.APP_NAME_PREFIX + '-docker-function';

        // Docker Image Function (Lambda)
        const repo = cdk.aws_ecr.Repository.fromRepositoryArn(this, 'EcrRepositoryArn', props.serverEnvMap.ECR_REPOSITORY_ARN);

        const dockerImageFunctionProps: any = {
            environment: props.serverEnvMap as any,
            code: cdk.aws_lambda.DockerImageCode.fromEcr(repo, {
                tagOrDigest: props.serverEnvMap.SERVER_RELEASE
            }),
            timeout: Duration.seconds(30),
            functionName: lambdaFunctionName,
            memorySize: 256,
        }

        if(props.serverEnvMap.VPC_ID) {
            const vpc = cdk.aws_ec2.Vpc.fromLookup(this, 'VPC', {
                region: props.awsEnvMap.AWS_REGION,
                vpcId: props.serverEnvMap.VPC_ID,
            });

            const subnets: ISubnet[] = [];
            const subnetIdList = props.serverEnvMap.SUBNET_ID_LIST.split(',');
            for(const nextSubnetId of subnetIdList) {
                subnets.push(cdk.aws_ec2.Subnet.fromSubnetId(this, nextSubnetId, nextSubnetId));
            }

            const securityGroups: ISecurityGroup[] = [];
            const securityGroupList = props.serverEnvMap.SECURITY_GROUP_LIST.split(',');
            for(const nextSecurityGroupId of securityGroupList) {
                securityGroups.push(cdk.aws_ec2.SecurityGroup.fromLookupById(this, nextSecurityGroupId, nextSecurityGroupId));
            }

            dockerImageFunctionProps.securityGroups = securityGroups;
            dockerImageFunctionProps.vpc = vpc;
            dockerImageFunctionProps.vpcSubnets = {
                subnets: subnets
            }
        }

        const dockerImageFunction = new cdk.aws_lambda.DockerImageFunction(this, lambdaFunctionName, dockerImageFunctionProps);

        if(dockerImageFunction.role) {
            const dbPassword = props.serverEnvMap.DATABASE_PASSWORD;
            if(dbPassword && dbPassword.startsWith('arn:aws:secretsmanager')) {
                dockerImageFunction.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: [dbPassword],
                    actions: ['secretsmanager:GetSecretValue'],
                }));
            }

            const metaBucketS3Arn = 'arn:aws:s3:::' + props.serverEnvMap.META_BUCKET_NAME;

            dockerImageFunction.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
                effect: Effect.ALLOW,
                resources: [
                    metaBucketS3Arn,
                    metaBucketS3Arn + '/*'
                ],
                actions: [
                    's3:DeleteObject',
                    's3:PutObject',
                    's3:ListBucket',
                    's3:GetObject',
                ]
            }));

            const awsLambdaVPCAccessExecutionRole = cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole');
            dockerImageFunction.role.addManagedPolicy(awsLambdaVPCAccessExecutionRole);
        }

        // Lookup the zone (assumes this exists already)
        const hostedZone = cdk.aws_route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
            hostedZoneId: props.serverEnvMap.HOSTED_ZONE_ID,
            zoneName: props.serverEnvMap.BASE_DOMAIN_NAME
        });

        // Defines an API Gateway REST API resource backed by our lambda function and link it to both the
        // domain name and the certificate
        const api = new cdk.aws_apigateway.LambdaRestApi(this, props.serverEnvMap.APP_NAME_PREFIX + '-endpoint', {
            handler: dockerImageFunction,
            deployOptions: {
                throttlingRateLimit: Number(props.serverEnvMap.RATE_LIMIT_REQUESTS),
                throttlingBurstLimit: Number(props.serverEnvMap.RATE_LIMIT_BURST)
            }
        });

        // Output various URLs for testing and debugging since these have randomly assigned unique names
        new cdk.CfnOutput(this, 'endpointUrl', {
            exportName: props.serverEnvMap.APP_NAME_PREFIX + 'EndpointUrl',
            description: 'The endpoint of where the Lambda service is bound',
            value: `${api.url}`
        });

        new cdk.CfnOutput(this, 'restApiId', {
            exportName: props.serverEnvMap.APP_NAME_PREFIX + 'RestApiId',
            description: 'The CloudFront proxy rule needs a domain name to route /api requests. Using this api.domainName would be better but does not seem to work. This is a workaround for getting the domain name of the Lambda endpoint.',
            value: api.restApiId
        });

        new cdk.CfnOutput(this, 'restApiUrl', {
            exportName: props.serverEnvMap.APP_NAME_PREFIX + 'RestApiUrl',
            description: 'The URL of where the REST API starts listening from this is the Lambda endpoint address plus /api so that CloudFront can define a proxy path to the api. This url will respond with a HealthCheck OK response. All other REST calls are below this URL path.',
            value: `${api.url}api`
        });
    }
}