import * as cdk from 'aws-cdk-lib/core';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { ROLES } from './config';

/**
 * Identity. Strictly B2B (FEATURES.md §1): there is no self-registration — an
 * account exists only via an org admin's invite, so self sign-up is disabled at
 * the pool level rather than merely hidden in the UI.
 *
 * Most of this workforce has no domain email, so phone/SMS is a first-class
 * sign-in path, not a fallback.
 */
export class AuthStack extends cdk.Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true, phone: true },
      autoVerify: { email: true, phone: true },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: true, otp: true, email: false },
      standardAttributes: {
        email: { required: false, mutable: true },
        phoneNumber: { required: false, mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        // Tenant is never null — strictly B2B, so there is no sentinel case.
        orgId: new cognito.StringAttribute({ mutable: true }),
        deptId: new cognito.StringAttribute({ mutable: true }),
        role: new cognito.StringAttribute({ mutable: true }),
        profession: new cognito.StringAttribute({ mutable: true }),
        skillLevel: new cognito.StringAttribute({ mutable: true }),
        language: new cognito.StringAttribute({ mutable: true }),
        learningMode: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_AND_PHONE_WITHOUT_MFA,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    for (const role of ROLES) {
      new cognito.CfnUserPoolGroup(this, `Group-${role}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: role,
        description: `${role} role group`,
      });
    }

    /**
     * An unspecified attribute allowlist grants the client write access to EVERY
     * mutable attribute — and all seven custom attributes are mutable. Without
     * this, any signed-in worker could call
     * `updateUserAttributes({'custom:role': 'admin', 'custom:orgId': '<other org>'})`
     * and both escalate privilege and cross the tenant boundary.
     *
     * Tenant, department and role are server-assigned during invite redemption.
     * Learning preferences are persisted to `USER#<id>` / `SETTINGS` in DynamoDB,
     * so none of the custom attributes need to be client-writable at all.
     */
    const readAttributes = new cognito.ClientAttributes()
      .withStandardAttributes({
        fullname: true,
        email: true,
        emailVerified: true,
        phoneNumber: true,
        phoneNumberVerified: true,
      })
      .withCustomAttributes(
        'orgId',
        'deptId',
        'role',
        'profession',
        'skillLevel',
        'language',
        'learningMode'
      );

    const writeAttributes = new cognito.ClientAttributes().withStandardAttributes({
      fullname: true,
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      authFlows: { userSrp: true, custom: true },
      preventUserExistenceErrors: true,
      readAttributes,
      writeAttributes,
      // Amplify handles refresh rotation (DATA-MODEL.md Decision 3).
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
  }
}
