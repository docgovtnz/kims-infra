import * as cdk from 'aws-cdk-lib';
import {Duration, Stack} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Effect} from 'aws-cdk-lib/aws-iam';
import {MyStackProps} from '../bin/kims-infra';

export class KimsServerStack extends Stack {
    constructor(scope: Construct, id: string, props: MyStackProps) {
        super(scope, id, props);

        const lambdaFunctionName = props.serverEnvMap.APP_NAME_PREFIX + '-docker-function';

        const vpc = cdk.aws_ec2.Vpc.fromLookup(this, 'VPC', {
            region: props.awsEnvMap.AWS_REGION,
            vpcId: 'vpc-a317a5c7'
        });

        const subnets = [
            cdk.aws_ec2.Subnet.fromSubnetId(this, 'subnet-ce5de597', 'subnet-ce5de597'),
            cdk.aws_ec2.Subnet.fromSubnetId(this, 'subnet-704c2f06', 'subnet-704c2f06'),
            cdk.aws_ec2.Subnet.fromSubnetId(this, 'subnet-a32f56c7', 'subnet-a32f56c7'),
        ];

        const securityGroups = [
            cdk.aws_ec2.SecurityGroup.fromLookupById(this, 'sg-70a03a17', 'sg-70a03a17')
        ]

        const repo = cdk.aws_ecr.Repository.fromRepositoryName(this, props.serverEnvMap.ECR_REPOSITORY_NAME, props.serverEnvMap.ECR_REPOSITORY_NAME);
        const dockerImageFunction = new cdk.aws_lambda.DockerImageFunction(this, lambdaFunctionName, {
            environment: props.serverEnvMap as any,
            code: cdk.aws_lambda.DockerImageCode.fromEcr(repo, {
                tag: props.serverEnvMap.SERVER_RELEASE
            }),
            timeout: Duration.seconds(30),
            functionName: lambdaFunctionName,
            securityGroups: securityGroups,
            vpc: vpc,
            vpcSubnets: {
                subnets: subnets
            }
        });

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

        //const apiDomainName = props.serverEnvMap.API_DOMAIN_PREFIX + '.' + props.serverEnvMap.BASE_DOMAIN_NAME;

        // Create a certificate before we have the DNS records setup, but that's ok
        // const apiCertificate = new cdk.aws_certificatemanager.Certificate(this, 'ApiCertificate', {
        //     domainName: apiDomainName,
        //     validation: cdk.aws_certificatemanager.CertificateValidation.fromDns(hostedZone)
        // });

        // OR: lookup the certificate from one that has already been created
        // const apiCertificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(this, 'Certificate', props.serverEnvMap.API_CERTIFICATE_ARN);


        // Defines an API Gateway REST API resource backed by our lambda function and link it to both the
        // domain name and the certificate
        const api = new cdk.aws_apigateway.LambdaRestApi(this, props.serverEnvMap.APP_NAME_PREFIX + 'Endpoint', {
            handler: dockerImageFunction,

            // domainName: {
            //     domainName: apiDomainName,
            //     certificate: apiCertificate,
            // }
        });

        // The tricky bit is that this gets done last so that it can target the ApiGateway and also note that the
        // recordName is the "short" part of the name and not the whole thing.
        // const route53ARecord = new cdk.aws_route53.ARecord(this, 'Route53ARecord', {
        //     zone: hostedZone,
        //     recordName: props.serverEnvMap.API_DOMAIN_PREFIX,
        //     target: cdk.aws_route53.RecordTarget.fromAlias(new cdk.aws_route53_targets.ApiGateway(api))
        // });

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