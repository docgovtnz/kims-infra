#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import {KimsServerStack} from '../lib/kims-server-stack';

export interface AwsEnvMap {
    AWS_ACCOUNT: string;
    AWS_REGION: string;
}

export interface ClientEnvMap {
    CLIENT_RELEASE: string;
    API_URL: string;
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
    API_DOMAIN_PREFIX: string;
    META_BUCKET_NAME: string;
    ECR_REPOSITORY_NAME: string;
}

export interface MyStackProps extends cdk.StackProps {
    clientEnvMap: ClientEnvMap;
    serverEnvMap: ServerEnvMap;

    /* If you don't specify 'env', this stack will be environment-agnostic.
     * Account/Region-dependent features and context lookups will not work,
     * but a single synthesized template can be deployed anywhere. */

    /* Uncomment the next line to specialize this stack for the AWS Account
     * and Region that are implied by the current CLI configuration. */
    // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

    /* Uncomment the next line if you know exactly what Account and Region you
     * want to deploy the stack to. */
    // env: { account: '123456789012', region: 'us-east-1' },

    /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
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
    const awsEnvMap = dotenv.config({path: envDir + 'server.env'}).parsed as unknown as AwsEnvMap;

    const myStackProps: MyStackProps = {
        clientEnvMap: clientEnvMap as unknown as ClientEnvMap,
        serverEnvMap: serverEnvMap,
        env: { account: awsEnvMap.AWS_ACCOUNT, region: awsEnvMap.AWS_REGION },
    }

    console.log(`envMap = ${JSON.stringify(myStackProps, null, 2)}`);

    return myStackProps;
}


const myStackProps = loadMyStackProps();
const app = new cdk.App();

new KimsServerStack(app, 'KimsServerStack', myStackProps);
//new KimsClientStack(app, 'KimsClientStack', myStackProps);

