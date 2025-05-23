#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import {KimsServerStack} from '../lib/kims-server-stack';
import {KimsClientStack} from '../lib/kims-client-stack';
import {KimsBaseStack} from '../lib/kims-base-stack';
import {KimsCognitoStack} from "../lib/kims-cognito-stack";

export interface AwsEnvMap {
    AWS_ACCOUNT: string;
    AWS_REGION: string;
}

export interface ClientEnvMap {
    CLIENT_RELEASE: string;
    API_URL: string;
    CLOUD_FRONT_CERTIFICATE: string;
    S3_RELEASE_BUCKET_ARN: string;
    APP_DOMAIN_PREFIX: string
}

export interface ServerEnvMap {
    SERVER_RELEASE: string;
    APP_NAME_PREFIX: string;
    DATABASE_HOST: string;
    DATABASE_PORT: number;
    DATABASE_USER: string;
    DATABASE_PASSWORD: string;
    BASE_DOMAIN_NAME: string;
    HOSTED_ZONE_ID: string;
    VPC_ID: string;
    SUBNET_ID_LIST: string;
    SECURITY_GROUP_LIST: string;
    API_DOMAIN_PREFIX: string;
    API_CERTIFICATE_ARN: string;
    META_BUCKET_NAME: string;
    ECR_REPOSITORY_ARN: string;
    // environment variables are always strings, these need to be converted into a number when used
    RATE_LIMIT_REQUESTS: string;
    RATE_LIMIT_BURST: string;
}

export interface MyStackProps extends cdk.StackProps {
    awsEnvMap: AwsEnvMap;
    clientEnvMap: ClientEnvMap;
    serverEnvMap: ServerEnvMap;
}


const loadMyStackProps = (): MyStackProps  => {
    if(!process.env.ENV_HOME) {
        throw new Error('ENV_HOME environment variable is not defined');
    }

    if(!process.env.ENV_NAME) {
        throw new Error('ENV_NAME environment variable is not defined');
    }

    const envDir = process.env.ENV_HOME + '/' + process.env.ENV_NAME + '/';

    const rawClientJson = fs.readFileSync(envDir + 'client.json').toString();
    const clientEnvMap = JSON.parse(rawClientJson);
    const serverEnvMap = dotenv.config({path: envDir + 'server.env'}).parsed as unknown as ServerEnvMap;
    const awsEnvMap = dotenv.config({path: envDir + 'aws.env'}).parsed as unknown as AwsEnvMap;

    const myStackProps: MyStackProps = {
        awsEnvMap: awsEnvMap,
        clientEnvMap: clientEnvMap,
        serverEnvMap: serverEnvMap,
        env: { account: awsEnvMap.AWS_ACCOUNT, region: awsEnvMap.AWS_REGION },
    }

    console.log(`envMap = ${JSON.stringify(myStackProps, null, 2)}`);

    return myStackProps;
}


const myStackProps = loadMyStackProps();
const app = new cdk.App();

new KimsBaseStack(app, process.env.ENV_NAME + '-kims-base-stack', myStackProps);
new KimsCognitoStack(app, process.env.ENV_NAME + '-kims-cognito-stack', myStackProps);
new KimsServerStack(app, process.env.ENV_NAME + '-kims-server-stack', myStackProps);
new KimsClientStack(app, process.env.ENV_NAME + '-kims-client-stack', myStackProps);
