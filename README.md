# KIMS Infra

This project creates and helps to manage the CloudFormation stacks of the KIMS application.

## Setup

1. You need to install the following
 - AWS-CLI; https://aws.amazon.com/cli/
 - AWS CDK; https://aws.amazon.com/cdk/ (npm -g install cdk)

2. You need to have your AWS CLI credentials file setup with the "aws_access_key_id" and "aws_secret_access_key" for the
account/environment you wish to deploy. There are multiple ways of managing these but the following seems to be the best
way for this project.
 - Login to the DOC AWS SSO form; https://docau.awsapps.com/start#/
 - Click on the "Command line or programmatic access" for the AWS account you will be working with
 - Select Option 2: Add a profile to your AWS credentials file
 - Copy the text of credentials (these expire after a few hour, so you have to do this quite often)
 - Add these to your ~/.aws/credentials file
 - Set the following environment variable either globally or in the shell where you are working. Watch out for how the
   account number is different for different accounts.

   export AWS_DEFAULT_PROFILE=252379044400_Administer-ROLE

From this point onwards you should be ok to run the various scripts and CDK deployment commands.

TIP: One good way of checking if your credentials are still valid and that you are pointed at the right environment is
to do a quick S3 directory listing from the command line of where you want to run the next CDK script from;

```shell
aws s3 ls
```

3. Clone the "kims-settings" project (git clone git@github.com:docgovtnz/kims-settings.git) this contains a large collection
of different environment .env files and .json files with all of the environment properties needed to define each of the
environments KIMS is deployed into.


4. These scripts depend on the following environment variables to select the properties of the environment you wish to
deploy the application into.

ENV_HOME - the directory of where all the different environments are held
ENV_NAME - the specific environment name/directory you wish to work with next

For example;
export ENV_HOME=/Users/richardperfect/Dev/perfect-consulting/kims-settings/env
export ENV_NAME=dev

## Environment setup

To create a KIMS environment from an untouched AWS account, the following things need to be created manually before the 
CDK scripts can be created. These manual setup steps are only needs once at the start of creating the environment and
once completed all further deployments of each release can be handled by the CDK scripts.

 - Database
 - Database Secret
 - S3 Meta Bucket
 - S3 Release bucket
 - ECR Container Registry 
 - Cognito Pool
 - Azure AD federation with Cognito
 - Route53 Hosted Zone
 - SSL Certificate/s




## Deploying

To deploy any release of Kims to any environment do the following steps

1. Login to AWS and setup your AWS credentials as outlined above
2. Set the ENV_HOME and ENV_NAME variables to point to the application environment you want to work with (see above)
3. Run the CDK deployment with the following

```shell
# Server
cdk deploy KimsServerStack

# Client
./copy-client-json.sh
cdk deploy KimsClientStack
```

Wait. And then wait some more. CDK/Cloudformation can take anywhere from a few mins to over an hour. It can also fail
for all sorts of reasons.

TIPS
 - "cdk ls" will give you a list of the stack names available for deployment, handy if you can't remember them
 - Sometimes it's better to "Delete" the Cloudformation stack first and then deploy the new one. It can be slow and 
 error prone to do an "update" but is better at doing a "delete" followed by the "create".

 - Logging there's a new half decent AWS CLI logging command that will download and follow Cloudwatch log streams.

```shell
aws logs tail /aws/lambda/dev-kims-docker-function --follow
```
