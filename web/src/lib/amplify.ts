'use client';

import { Amplify } from 'aws-amplify';

/**
 * Amplify handles token storage and refresh rotation (DATA-MODEL.md Decision 3).
 *
 * Sign-up is disabled at the Cognito pool level — accounts exist only via an org
 * admin's invite, so there is no registration flow to configure here.
 */
export function configureAmplify() {
  Amplify.configure(
    {
      Auth: {
        Cognito: {
          userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? '',
          userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '',
        },
      },
    },
    { ssr: true }
  );
}
