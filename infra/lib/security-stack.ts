import * as cdk from 'aws-cdk-lib/core';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

/**
 * Encryption keys. The claim the product makes is isolation + encryption +
 * auditability (FEATURES.md §9) — not zero-knowledge, which is incompatible with
 * a model that has to read the documents to answer from them.
 *
 * Per-org customer-managed keys are created at org-provisioning time by the
 * application, not here; this stack holds the account-level keys that exist
 * before any tenant does.
 */
export class SecurityStack extends cdk.Stack {
  readonly dataKey: kms.Key;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.dataKey = new kms.Key(this, 'DataKey', {
      enableKeyRotation: true,
      alias: 'alias/skillbridge-data',
      description: 'Default encryption key for DynamoDB and org document storage',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, 'DataKeyArn', { value: this.dataKey.keyArn });
  }
}
