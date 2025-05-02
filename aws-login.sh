#!/bin/bash

export AWS_PROFILE=DevopsDevTest-335220573311
export AWS_REGION=ap-southeast-2

aws configure sso
aws sts get-caller-identity --profile DevopsDevTest-335220573311
