import * as cdk from 'aws-cdk-lib';
import {Duration, RemovalPolicy, Stack} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {MyStackProps} from '../bin/kims-infra';
import * as rds from 'aws-cdk-lib/aws-rds';
import {AuroraCapacityUnit, AuroraPostgresEngineVersion} from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';
import {ISecurityGroup} from 'aws-cdk-lib/aws-ec2';

export class KimsBaseStack extends Stack {
    constructor(scope: Construct, id: string, props: MyStackProps) {
        super(scope, id, props);

        const ENV_NAME = process.env.ENV_NAME;
        if(!ENV_NAME) {
            throw new Error('ENV_NAME is not defined');
        }

        // Create username and password secret for DB Cluster
        const secret = new rds.DatabaseSecret(this, 'AuroraSecret', {
            secretName: `${ENV_NAME}/kims/database/password`,
            username: 'clusteradmin',
        });

        // The VPC to place the cluster in
        const vpc = cdk.aws_ec2.Vpc.fromLookup(this, 'VPC', {
            region: props.awsEnvMap.AWS_REGION,
            vpcId: props.serverEnvMap.VPC_ID,
        });

        const subnets: ec2.ISubnet[] = [];
        const subnetIdList = props.serverEnvMap.SUBNET_ID_LIST.split(',');
        for(const nextSubnetId of subnetIdList) {
            subnets.push(cdk.aws_ec2.Subnet.fromSubnetId(this, nextSubnetId, nextSubnetId));
        }

        const subnetGroup = new rds.SubnetGroup(this, 'SubnetGroup', {
            description: `Subnet group for ${ENV_NAME}-kims-subnet-group`,
            vpc: vpc,
            subnetGroupName: `${ENV_NAME}-kims-subnet-group`,
            vpcSubnets: {
                subnets: subnets,
            },
        });

        const securityGroups: ISecurityGroup[] = [];
        const securityGroupList = props.serverEnvMap.SECURITY_GROUP_LIST.split(',');
        for(const nextSecurityGroupId of securityGroupList) {
            securityGroups.push(cdk.aws_ec2.SecurityGroup.fromLookupById(this, nextSecurityGroupId, nextSecurityGroupId));
        }

        // Create the serverless cluster, provide all values needed to customise the database.
        const cluster = new rds.ServerlessCluster(this, 'AuroraCluster', {
            clusterIdentifier: `${ENV_NAME}-kims-serverless-cluster`,
            engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
            vpc: vpc,
            subnetGroup: subnetGroup,
            securityGroups: securityGroups,
            credentials: rds.Credentials.fromSecret(secret),
            defaultDatabaseName: `${ENV_NAME}_kims_db`,
            parameterGroup: rds.ParameterGroup.fromParameterGroupName(this, 'ParameterGroup', 'default.aurora-postgresql10'),
            scaling: {
                minCapacity: AuroraCapacityUnit.ACU_2,
                maxCapacity: AuroraCapacityUnit.ACU_4
            },
            enableDataApi: true
        });

        const metaBucket = new s3.Bucket(this, 'MetaBucket', {
            bucketName: `${ENV_NAME}-kims-meta`,
            publicReadAccess: false,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const releaseBucket = new s3.Bucket(this, 'ReleaseBucket', {
            bucketName: `${ENV_NAME}-kims-release`,
            publicReadAccess: false,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const repository = new ecr.Repository(this, 'Repository', {
            repositoryName: `${ENV_NAME}-kims-server`,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const userPool = new cognito.UserPool(this, 'UserPool', {
            userPoolName: `${ENV_NAME}-kims-user-pool`,
            removalPolicy: RemovalPolicy.DESTROY
        });

        const webAppDomainName = props.clientEnvMap.APP_DOMAIN_PREFIX + '.' + props.serverEnvMap.BASE_DOMAIN_NAME;
        const appClient = userPool.addClient('AppClient', {
            userPoolClientName: `${ENV_NAME}-kims-appclient`,
            accessTokenValidity: Duration.minutes(600),
            idTokenValidity: Duration.minutes(600),
            authFlows: {
                userPassword: true
            },
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                    implicitCodeGrant: true
                },
                callbackUrls: [
                    `https://${webAppDomainName}/login-callback`
                ]
            }
        })
    }
}