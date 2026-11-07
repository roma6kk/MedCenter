import { obtainTokenGrant } from '../demo-seed/oauth-pkce-client';
import type { SmokeAccount, SmokeConfig, Session, TokenClaims } from './smoke-types';

export const REQUESTED_SCOPE = 'launch patient/*.read patient/*.write user/*.read user/*.write';

export function decodeClaims(token: string): TokenClaims {
  const payload = token.split('.')[1];
  if (payload === undefined) {
    throw new Error('the access token is not a JWT');
  }
  const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('the access token payload is not a JSON object');
  }
  return parsed as TokenClaims;
}

const LOGIN_THROTTLE_MARKER = 'rate limit reached';
const THROTTLE_WAIT_MS = 62_000;
const MAX_THROTTLE_RETRIES = 2;

const CREDENTIALS_REJECTED_MARKER = 'credentials rejected';

export const RESEED_USERS_HINT =
  'the account from the seed manifest is not in the auth database (was the postgres volume recreated?): ' +
  'run "npm run seed:demo -- --users --with-admin --consents"';

export function withLoginHint(error: unknown): unknown {
  if (error instanceof Error && error.message.includes(CREDENTIALS_REJECTED_MARKER) && !error.message.includes(RESEED_USERS_HINT)) {
    error.message = `${error.message}; ${RESEED_USERS_HINT}`;
  }
  return error;
}

const sleep = (millis: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, millis));

export async function signIn(config: SmokeConfig, account: SmokeAccount): Promise<Session> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await signInOnce(config, account);
    } catch (error: unknown) {
      const throttled = error instanceof Error && error.message.includes(LOGIN_THROTTLE_MARKER);
      if (!throttled || attempt >= MAX_THROTTLE_RETRIES) {
        throw error;
      }
      console.log(`login of ${account.email} is throttled by the login form; waiting a minute`);
      await sleep(THROTTLE_WAIT_MS);
    }
  }
}

async function signInOnce(config: SmokeConfig, account: SmokeAccount): Promise<Session> {
  const grant = await obtainTokenGrant(
    { authBaseUrl: config.baseUrl, clientId: config.oauthClientId, redirectUri: config.redirectUri, scope: REQUESTED_SCOPE },
    { email: account.email, password: account.password },
  );
  return {
    email: account.email,
    role: account.role,
    accessToken: grant.accessToken,
    grantedScope: grant.scope ?? decodeClaims(grant.accessToken).scope ?? '',
    claims: decodeClaims(grant.accessToken),
  };
}
