#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { BasicServerCdkStack } from '../lib/basic-server-cdk-stack';

const app = new cdk.App();
new BasicServerCdkStack(app, 'BasicServerCdkStack');
