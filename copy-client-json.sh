#!/bin/bash

# Copy the client.env file for the current environment into it's S3 location so that CloudFront can use it
aws s3 cp $ENV_HOME/$ENV_NAME/client.json s3://kims-dev-release/env/$ENV_NAME/client.json
