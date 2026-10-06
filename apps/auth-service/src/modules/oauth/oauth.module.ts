import { Module } from '@nestjs/common';
import { TOKEN_REVOCATION } from '@medcenter/common';

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
 */
export function loadRegisteredClients(source: NodeJS.ProcessEnv = process.env): ReadonlyArray<RegisteredClient> {
  const raw = source['OAUTH_CLIENTS_JSON'];
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReadonlyArray<RegisteredClient>) : [];
  } catch {
    return [];
  }
}

@Module({
  controllers: [OAuthController],
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
