import {Duration, RemovalPolicy, Stack} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {MyStackProps} from '../bin/kims-infra';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import {UserPoolIdentityProviderSaml, UserPoolIdentityProviderSamlMetadata} from "aws-cdk-lib/aws-cognito";

export class KimsCognitoStack extends Stack {
    constructor(scope: Construct, id: string, props: MyStackProps) {
        super(scope, id, props);
        console.log('########## kims-cognito-stack');
        const ENV_NAME = process.env.ENV_NAME;
        if(!ENV_NAME) {
            throw new Error('ENV_NAME is not defined');
        }

        // // The VPC to place the cluster in
        // const vpc = cdk.aws_ec2.Vpc.fromLookup(this, 'VPC', {
        //     region: props.awsEnvMap.AWS_REGION,
        //     vpcId: props.serverEnvMap.VPC_ID,
        // });
        //
        // const subnets: ec2.ISubnet[] = [];
        // const subnetIdList = props.serverEnvMap.SUBNET_ID_LIST.split(',');
        // for(const nextSubnetId of subnetIdList) {
        //     subnets.push(cdk.aws_ec2.Subnet.fromSubnetId(this, nextSubnetId, nextSubnetId));
        // }
        //
        // const subnetGroup = new rds.SubnetGroup(this, 'SubnetGroup', {
        //     description: `Subnet group for ${ENV_NAME}-kims-subnet-group`,
        //     vpc: vpc,
        //     subnetGroupName: `${ENV_NAME}-kims-subnet-group`,
        //     vpcSubnets: {
        //         subnets: subnets,
        //     },
        // });
        //
        // const securityGroups: ISecurityGroup[] = [];
        // const securityGroupList = props.serverEnvMap.SECURITY_GROUP_LIST.split(',');
        // for(const nextSecurityGroupId of securityGroupList) {
        //     securityGroups.push(cdk.aws_ec2.SecurityGroup.fromLookupById(this, nextSecurityGroupId, nextSecurityGroupId));
        // }


        const userPool = new cognito.UserPool(this, 'UserPool', {
            userPoolName: `${ENV_NAME}-kims-cognito-pool`,
            removalPolicy: RemovalPolicy.DESTROY
        });

        const webAppDomainName = props.clientEnvMap.APP_DOMAIN_PREFIX + '.' + props.serverEnvMap.BASE_DOMAIN_NAME;
        const appClient = userPool.addClient('AppClient', {
            userPoolClientName: `${ENV_NAME}-kims-cognito-appclient`,
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
        });

        userPool.registerIdentityProvider(new UserPoolIdentityProviderSaml(this, 'SamlProvider', {
            userPool: userPool,
            name: 'Azure-SSO',
            metadata: UserPoolIdentityProviderSamlMetadata.url('https://login.microsoftonline.com/f0cbb24f-a2f6-498f-b536-6eb9a13a357c/federationmetadata/2007-06/federationmetadata.xml?appid=34cd4535-9757-442d-a9c0-f6924e6821eb')
        }));
    }
}