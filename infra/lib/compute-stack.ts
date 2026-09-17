import * as cdk from 'aws-cdk-lib/core';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { MODELS, UNDERLYING_MODELS } from './config';

export interface ComputeStackProps extends cdk.StackProps {
  readonly table: dynamodb.ITable;
}

/**
 * Hosting for the voice service.
 *
 * The voice path needs a persistent process holding WebSocket connections to
 * both the browser and Sarvam's realtime endpoints, which does not fit Lambda or
 * Amplify Hosting — hence App Runner (FEATURES/HANDOFF: chosen over ECS Fargate
 * for lower ops overhead).
 *
 * The App Runner service itself is created in the development session once an
 * image exists in this repository; this stack provides the registry and the
 * runtime role it will assume.
 */
export class ComputeStack extends cdk.Stack {
  readonly voiceRepo: ecr.Repository;
  readonly voiceServiceRole: iam.Role;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    this.voiceRepo = new ecr.Repository(this, 'VoiceServiceRepo', {
      repositoryName: 'skillbridge-voice',
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [{ maxImageCount: 5 }],
    });

    this.voiceServiceRole = new iam.Role(this, 'VoiceServiceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: 'Runtime role for the voice service on App Runner',
    });

    this.voiceServiceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        // Profile ARN plus the underlying foundation models the profile routes to.
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${MODELS.voiceOrchestrator}`,
          ...UNDERLYING_MODELS.map((m) => `arn:aws:bedrock:*::foundation-model/${m}`),
        ],
      })
    );

    props.table.grantReadWriteData(this.voiceServiceRole);

    new cdk.CfnOutput(this, 'VoiceRepoUri', { value: this.voiceRepo.repositoryUri });
  }
}
