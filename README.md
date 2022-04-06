# KIMS Infra

This project creates and helps to manage the CloudFormation stacks of the KIMS application.

## Setup

1. You need to have your AWS CLI credentials file setup with the "aws_access_key_id" and "aws_secret_access_key" for the
account/environment you wish to deploy.

2. These scripts depend on the following environment variables to select the properties of the environment you wish to
deploy the application into.

ENV_HOME - the directory of where all the different environments are held
ENV_NAME - the specific environment name/directory you wish to work with next

For example;
export ENV_HOME=/Users/richardperfect/Dev/kims-infra/env
export ENV_NAME=dev


## Deploying

To deploy any release of Kims to any environment do the following steps

1. Set the ENV_NAME environment TODO...
