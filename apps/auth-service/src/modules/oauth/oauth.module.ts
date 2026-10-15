import { Module } from '@nestjs/common';
import { TOKEN_REVOCATION } from '@medcenter/common';
import { z } from 'zod';

import { UsersModule } from '../users/users.module';
import { AuthorizeController } from './authorize.controller';
import { OAuthErrorFilter } from './filters/oauth-error.filter';
import { AuthorizePageGuard } from './guards/authorize-page.guard';
import { TokenClientGuard } from './guards/token-client.guard';
import {
  CLIENT_REGISTRY,
  ClientGuard,
  InMemoryClientRegistry,
  type RegisteredClient,
} from './guards/client.guard';
import { SIGNING_KEYS, JwtService, type SigningKeys } from './jwt.service';
import { JwksService } from './jwks.service';
import { LOGIN_ATTEMPT_STORE, createLoginAttemptStore } from './login/login-attempt-store';
import { LOGIN_KEYS, loadLoginKeys } from './login/login-keys';
import { LoginPageResponder } from './login/login-page.responder';
import { LoginRateLimitFilter } from './login/login-rate-limit.filter';
import { LoginSessionGuard } from './login/login-session.guard';
import { LoginSessionService } from './login/login-session.service';
import { LoginThrottle } from './login/login-throttle.service';
import { LoginController } from './login/login.controller';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { PkceService } from './pkce.service';
import {
  InMemoryTokenDenylist,
  InMemoryTokenStore,
  TOKEN_DENYLIST,
  TOKEN_STORE,
  TokenService,
} from './token.service';

/**
 * Signing keys come from the environment: `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`
 * (PEM), `JWT_ISSUER` and an optional `JWT_KEY_ID` (default `auth-1`).
 *
 * The factory is eager, so importing this module makes all three variables a
 * hard boot requirement for the whole service — a deployment that forgets them
 * fails at startup, not on the first token request.
 */
export function loadSigningKeys(source: NodeJS.ProcessEnv = process.env): SigningKeys {
  const privateKeyPem = source['JWT_PRIVATE_KEY'];
  const publicKeyPem = source['JWT_PUBLIC_KEY'];
  const issuer = source['JWT_ISSUER'];
  if (!privateKeyPem || !publicKeyPem || !issuer) {
    throw new Error(
      'OAuth signing requires JWT_PRIVATE_KEY, JWT_PUBLIC_KEY and JWT_ISSUER to be set',
    );
  }
  return { privateKeyPem, publicKeyPem, issuer, kid: source['JWT_KEY_ID'] ?? 'auth-1' };
}

/**
 * Dev convenience: seed the client registry from `OAUTH_CLIENTS_JSON`
 * (a JSON array of `{ clientId, redirectUris, scopes, isPublic }`). The
 * `auth.oauth_client`-backed registry replaces this with persistence.
 *
 * M3: the payload is validated with `zod` and rejected loudly at boot. The
 * previous `as` cast let a malformed entry throw a `TypeError` on a public
 * route (`redirectUris[0]`, `allowed.includes(...)` → 500) or, worse, silently
 * degrade to an empty registry where every client gets `401 invalid_client`,
 * indistinguishable from a real auth failure.
 */
const registeredClientSchema = z.object({
  clientId: z.string().min(1),
  redirectUris: z.array(z.string().min(1)).min(1),
  scopes: z.array(z.string()),
  isPublic: z.boolean(),
  clientSecret: z.string().min(1).optional(),
});

const registeredClientsSchema = z.array(registeredClientSchema);

export function loadRegisteredClients(source: NodeJS.ProcessEnv = process.env): ReadonlyArray<RegisteredClient> {
  const raw = source['OAUTH_CLIENTS_JSON'];
  if (!raw) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error: unknown) {
    throw new Error('OAUTH_CLIENTS_JSON is not valid JSON', { cause: error });
  }
  return registeredClientsSchema.parse(parsed);
}

/**
 * SMART / OAuth2 surface (API 2.1) plus the authorization server's own login
 * step (assumption UI-1). `UsersModule` supplies the two answers it needs from
 * the `auth` schema: credential verification and the identity a token is
 * minted for (`IDENTITY_RESOLVER`).
 */
@Module({
  imports: [UsersModule],
  controllers: [OAuthController, AuthorizeController, LoginController],
  providers: [
    PkceService,
    JwtService,
    JwksService,
    OAuthService,
    TokenService,
    ClientGuard,
    TokenClientGuard,
    AuthorizePageGuard,
    OAuthErrorFilter,
    LoginSessionService,
    LoginPageResponder,
    LoginSessionGuard,
    LoginThrottle,
    LoginRateLimitFilter,
    { provide: LOGIN_ATTEMPT_STORE, useFactory: createLoginAttemptStore },
    { provide: LOGIN_KEYS, useFactory: loadLoginKeys },
    { provide: SIGNING_KEYS, useFactory: loadSigningKeys },
    { provide: TOKEN_STORE, useClass: InMemoryTokenStore },
    { provide: TOKEN_DENYLIST, useClass: InMemoryTokenDenylist },
    { provide: CLIENT_REGISTRY, useFactory: (): InMemoryClientRegistry => new InMemoryClientRegistry(loadRegisteredClients()) },
    // The issuer is the only party that knows what it revoked, so it is also the
    // one that answers the guard layer's revocation question. `TokenService`
    // owns the `session:` denylist namespace; exporting the token makes it
    // visible to `APP_GUARD`'s `JwtAuthGuard` in `AppModule`.
    { provide: TOKEN_REVOCATION, useExisting: TokenService },
  ],
  exports: [OAuthService, TOKEN_REVOCATION],
})
export class OAuthModule {}
