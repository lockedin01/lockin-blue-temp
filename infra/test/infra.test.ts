import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { SecurityStack } from '../lib/security-stack';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';

test('AppTable uses the PK/SK scheme with both access-pattern indexes', () => {
  const app = new cdk.App();
  const security = new SecurityStack(app, 'TestSecurity');
  const data = new DataStack(app, 'TestData', { dataKey: security.dataKey });

  Template.fromStack(data).hasResourceProperties('AWS::DynamoDB::Table', {
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      { IndexName: 'GSI1' },
      { IndexName: 'GSI2' },
    ],
  });
});

test('sign-up is closed — accounts exist only via an org admin invite', () => {
  const app = new cdk.App();
  const auth = new AuthStack(app, 'TestAuth');

  Template.fromStack(auth).hasResourceProperties('AWS::Cognito::UserPool', {
    AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
  });
});
