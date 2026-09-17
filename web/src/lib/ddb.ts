import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * Server-side only. CRUD runs through Next.js server routes (DATA-MODEL.md
 * Decision 2), so this client never reaches the browser.
 */

const client = new DynamoDBClient({
  region: process.env.NEXT_PUBLIC_AWS_REGION ?? 'ap-northeast-1',
});

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE_NAME = process.env.APP_TABLE_NAME ?? '';
