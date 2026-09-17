import * as cdk from 'aws-cdk-lib/core';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import { Construct } from 'constructs';
import { APP_NAME } from './config';

export interface WebStackProps extends cdk.StackProps {
  readonly userPoolId: string;
  readonly userPoolClientId: string;
  readonly tableName: string;
}

/**
 * Amplify Hosting for the Next.js app.
 *
 * Platform is WEB_COMPUTE, not WEB: CRUD runs through Next.js server routes
 * (DATA-MODEL.md Decision 2), so the app is not a static export.
 *
 * The GitHub repository connection and branch are attached in the development
 * session — they need an OAuth token/secret that does not belong in source.
 */
export class WebStack extends cdk.Stack {
  readonly app: amplify.CfnApp;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    this.app = new amplify.CfnApp(this, 'WebApp', {
      name: `${APP_NAME}-web`,
      platform: 'WEB_COMPUTE',
      environmentVariables: [
        { name: 'NEXT_PUBLIC_COGNITO_USER_POOL_ID', value: props.userPoolId },
        { name: 'NEXT_PUBLIC_COGNITO_CLIENT_ID', value: props.userPoolClientId },
        { name: 'NEXT_PUBLIC_AWS_REGION', value: this.region },
        { name: 'APP_TABLE_NAME', value: props.tableName },
      ],
    });

    new cdk.CfnOutput(this, 'AmplifyAppId', { value: this.app.attrAppId });
  }
}
