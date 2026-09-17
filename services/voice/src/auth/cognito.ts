import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { config } from '../config.js';

export class VoiceAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'UNAVAILABLE' = 'UNAUTHORIZED'
  ) {
    super(message);
  }
}

export interface VoiceUser {
  readonly userId: string;
  readonly orgId: string;
  readonly role: string;
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: config.cognito.userPoolId,
  clientId: config.cognito.clientId,
  tokenUse: 'access',
});

/**
 * Verify a Cognito access token arriving in a socket's FIRST FRAME.
 *
 * Never accept the token from the connection URL: query strings end up in proxy
 * logs, access logs and browser history.
 *
 * Every user belongs to an organization — the product is strictly B2B, so a
 * token without an `orgId` is malformed and must be rejected rather than
 * defaulted.
 */
export async function verifyToken(_token: string): Promise<VoiceUser> {
  void verifier;
  throw new Error('not implemented');
}
