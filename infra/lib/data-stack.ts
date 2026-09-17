import * as cdk from 'aws-cdk-lib/core';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface DataStackProps extends cdk.StackProps {
  readonly dataKey: kms.IKey;
}

/**
 * Single-table design. Key scheme and access patterns: DATA-MODEL.md.
 *
 * Partitioning splits by WRITE VOLUME, not by tenant: high-volume worker-owned
 * items use `USER#<userId>`, while `ORG#<orgId>` holds only low-volume config and
 * content. Putting everything under the org would cap a whole workforce on one
 * partition.
 */
export class DataStack extends cdk.Stack {
  readonly table: dynamodb.Table;
  readonly orgDocsBucket: s3.Bucket;
  readonly assetsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, 'AppTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.dataKey,
      timeToLiveAttribute: 'ttl',
      // Feeds the skill profiler (FEATURES.md §12) — stream-driven, never on the
      // request path.
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Org directory: all users in an org, in a department, or by role within a
    // department — one index, via begins_with on the sort key.
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });

    // Invite redemption begins with only the code — the org is unknown then.
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
    });

    // Per-org SOPs and documentation. One KB data source per org points at that
    // org's `org=<orgId>/docs/` prefix — this prefix is what enforces KB isolation.
    this.orgDocsBucket = new s3.Bucket(this, 'OrgDocsBucket', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: props.dataKey,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 3D models, schematics and 2D fallback posters. Content-hashed filenames,
    // served through the CDN and cached indefinitely.
    this.assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new cdk.CfnOutput(this, 'TableName', { value: this.table.tableName });
    new cdk.CfnOutput(this, 'OrgDocsBucketName', { value: this.orgDocsBucket.bucketName });
    new cdk.CfnOutput(this, 'AssetsBucketName', { value: this.assetsBucket.bucketName });
  }
}
