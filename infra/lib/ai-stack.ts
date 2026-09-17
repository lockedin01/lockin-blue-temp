import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { DynamoEventSource, SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { MODELS, UNDERLYING_MODELS } from './config';

export interface AiStackProps extends cdk.StackProps {
  readonly table: dynamodb.ITable;
  readonly orgDocsBucket: s3.IBucket;
}

/**
 * The four agents (FEATURES.md §13), each with its own IAM role so that no agent
 * can reach another's resources. Workflows are never merged: only the voice tutor
 * orchestrator is synchronous, everything else is queue- or stream-driven, so
 * batch work can never bottleneck a live voice turn.
 *
 * NOT DEFINED HERE — left for the development session:
 *   - Bedrock Knowledge Base + its vector store (one KB per org, created at
 *     org-provisioning time against that org's `org=<orgId>/docs/` S3 prefix)
 *   - AgentCore Gateway + Identity, and the Cedar policy store
 *   - The Strands agent definitions themselves
 */
export class AiStack extends cdk.Stack {
  readonly voiceOrchestratorRole: iam.Role;
  readonly learningPlanRole: iam.Role;
  readonly assessmentScorerRole: iam.Role;
  readonly skillProfilerRole: iam.Role;

  constructor(scope: Construct, id: string, props: AiStackProps) {
    super(scope, id, props);

    // An inference profile needs invoke permission on the profile AND on the
    // underlying foundation model in every region the profile may route to.
    // Granting only the profile ARN fails at call time with AccessDenied.
    const bedrockInvoke = (profileId: string) =>
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${profileId}`,
          ...UNDERLYING_MODELS.map((m) => `arn:aws:bedrock:*::foundation-model/${m}`),
        ],
      });

    const agentRole = (name: string, modelId: string) => {
      const role = new iam.Role(this, `${name}Role`, {
        assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
        description: `Isolated execution role for the ${name} agent`,
      });
      role.addToPolicy(bedrockInvoke(modelId));
      return role;
    };

    this.voiceOrchestratorRole = agentRole('VoiceOrchestrator', MODELS.voiceOrchestrator);
    this.learningPlanRole = agentRole('LearningPlanGenerator', MODELS.learningPlanGenerator);
    this.assessmentScorerRole = agentRole('AssessmentScorer', MODELS.assessmentScorer);
    this.skillProfilerRole = agentRole('SkillProfiler', MODELS.skillProfiler);

    props.table.grantReadData(this.voiceOrchestratorRole);
    props.table.grantReadWriteData(this.learningPlanRole);
    props.table.grantReadWriteData(this.assessmentScorerRole);
    props.table.grantReadWriteData(this.skillProfilerRole);
    props.orgDocsBucket.grantRead(this.learningPlanRole);

    /* ── skill profiler pipeline: stream → queue → worker ──────────────────────
       Debounced through a queue rather than invoked per stream record: a worker
       generates many events per session and the profile only needs to be
       recomputed periodically. Nothing in this chain is on a request path. */

    const profilerDlq = new sqs.Queue(this, 'SkillProfilerDlq', {
      retentionPeriod: cdk.Duration.days(14),
    });

    const profilerQueue = new sqs.Queue(this, 'SkillProfilerQueue', {
      visibilityTimeout: cdk.Duration.minutes(6),
      deadLetterQueue: { queue: profilerDlq, maxReceiveCount: 3 },
    });

    // Placeholder implementations — replaced with real handlers in the
    // development session. Inline so the stack synthesizes without assets.
    const placeholder = lambda.Code.fromInline(
      'exports.handler = async () => { throw new Error("not implemented"); };'
    );

    const streamFanout = new lambda.Function(this, 'EventStreamFanout', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: placeholder,
      timeout: cdk.Duration.seconds(30),
      environment: { QUEUE_URL: profilerQueue.queueUrl },
      description: 'Filters EVT# stream records and enqueues profiling work',
    });

    streamFanout.addEventSource(
      new DynamoEventSource(props.table, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 100,
        maxBatchingWindow: cdk.Duration.minutes(1),
        retryAttempts: 2,
      })
    );
    profilerQueue.grantSendMessages(streamFanout);

    const skillProfiler = new lambda.Function(this, 'SkillProfilerWorker', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: placeholder,
      timeout: cdk.Duration.minutes(5),
      environment: {
        TABLE_NAME: props.table.tableName,
        MODEL_ID: MODELS.skillProfiler,
      },
      description:
        'Derives the worker skill profile and updates materialized department aggregates',
    });

    skillProfiler.addEventSource(new SqsEventSource(profilerQueue, { batchSize: 10 }));
    props.table.grantReadWriteData(skillProfiler);
    skillProfiler.addToRolePolicy(bedrockInvoke(MODELS.skillProfiler));

    new cdk.CfnOutput(this, 'SkillProfilerQueueUrl', { value: profilerQueue.queueUrl });
  }
}
