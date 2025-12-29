#!/bin/bash
# Helper script to set environment variables on AWS Elastic Beanstalk
# Usage: ./set-aws-secrets.sh <environment-name>

ENV_NAME=$1
if [ -z "$ENV_NAME" ]; then
  echo "Usage: ./set-aws-secrets.sh <environment-name>"
  exit 1
fi

echo "Setting environment properties for $ENV_NAME..."

aws elasticbeanstalk update-environment --environment-name "$ENV_NAME" --option-settings \
  Namespace=aws:elasticbeanstalk:application:environment,OptionName=UPSTOX_API_KEY,Value=efb14d7b-93b9-4fba-9398-f2e0b170b654 \
  Namespace=aws:elasticbeanstalk:application:environment,OptionName=UPSTOX_API_SECRET,Value=lorxtpfd88 \
  Namespace=aws:elasticbeanstalk:application:environment,OptionName=PRODUCTION_DOMAIN,Value=perala.in \
  Namespace=aws:elasticbeanstalk:application:environment,OptionName=NODE_ENV,Value=production

echo "Done. Environment will restart shortly."
