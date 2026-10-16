import { obtainTokenGrant } from '../demo-seed/oauth-pkce-client';
import type { SmokeAccount, SmokeConfig, Session, TokenClaims } from './smoke-types';

/** What the web client asks for; the server narrows it to the role (API §0 scope matrix). */
export const REQUESTED_SCOPE = 'launch patient/*.read patient/*.write user/*.read user/*.write';

/** The payload of a JWT, unverified: the suite only inspects what the server says about the token. */
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
/** The login form allows 10 attempts per minute per address; a minute later the window is fresh. */
const THROTTLE_WAIT_MS = 62_000;
const MAX_THROTTLE_RETRIES = 2;

const sleep = (millis: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, millis));

/**
 * The real browser flow (GET /oauth/authorize -> POST /oauth/login -> code ->
 * POST /oauth/token) through the edge, reusing the seed's PKCE client. The
 * password is handed to it and never logged.
 */
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
