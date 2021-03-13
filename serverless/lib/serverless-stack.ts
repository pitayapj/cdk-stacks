import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as path from 'path';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';
import * as sqs from '@aws-cdk/aws-sqs';
import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';

export class ServerlessStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    //バケットを作成
    const bucket = new s3.Bucket(this, `${this.stackName}-Bucket`,{
      bucketName: "very-unique-bucket-name-2205",
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    //SQSを作成
    const sqs_queue = new sqs.Queue(this, `${this.stackName}-Queue`, {
      queueName: "serverless-queue"
    });
    //DynamoDBテーブルにPutできるロールを作成
    const custom_policy = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "S3AccessStatement",
          "Effect": "Allow",
          "Action": [
            "sqs:SendMessage"
          ],
          "Resource": [
            sqs_queue.queueArn
          ],
        },
      ]
    };
    const custom_policy_document = iam.PolicyDocument.fromJson(custom_policy);
    const lambda_role = new iam.Role(this,`${this.stackName}-lambda-role`,
    {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: { "custom-lambda-role": custom_policy_document },
    });

    const lambda_fn = new lambda.Function(this, `${this.stackName}-LambdaFunction`, {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/lambda_code')),
      role: lambda_role,
      environment: {
        'SQS_QUEUE_URL': sqs_queue.queueUrl
      }
    });

    lambda_fn.addEventSource(new S3EventSource(bucket, {
      events: [ s3.EventType.OBJECT_CREATED ]
    }))

  }
}
