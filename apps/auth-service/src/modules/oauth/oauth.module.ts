import { createPrivateKey, createPublicKey } from 'node:crypto';

import { forwardRef, Module } from '@nestjs/common';
import { TOKEN_REVOCATION } from '@medcenter/common';
import { z } from 'zod';

import { readSessionIdleTimeoutMs } from '../../config/auth-env';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { AccountDeactivationController } from './account-deactivation.controller';
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
import { LoginAssetsController } from './login/login-assets.controller';
import { LOGIN_ATTEMPT_STORE, createLoginAttemptStore } from './login/login-attempt-store';
import { LOGIN_KEYS, loadLoginKeys } from './login/login-keys';
import { LoginPageResponder } from './login/login-page.responder';
import { LoginRateLimitFilter } from './login/login-rate-limit.filter';
import { LoginSessionGuard } from './login/login-session.guard';
import { LoginSessionService } from './login/login-session.service';
import { LoginThrottle } from './login/login-throttle.service';
import { LoginController } from './login/login.controller';
import { OAuthController } from './oauth.controller';
import { SESSION_IDLE_TIMEOUT_MS, OAuthService } from './oauth.service';
import { PkceService } from './pkce.service';
import { TOKEN_STORES, createTokenStores, type TokenStores } from './redis-token-stores';
import {
  TOKEN_DENYLIST,
  TOKEN_STORE,
  TokenService,
  type TokenDenylist,
  type TokenStore,
} from './token.service';

// Eager factory: missing, unparsable or mismatched keys fail the boot, not the first token request.
export function loadSigningKeys(source: NodeJS.ProcessEnv = process.env): SigningKeys {
  const privateKeyPem = source['JWT_PRIVATE_KEY'];
  const publicKeyPem = source['JWT_PUBLIC_KEY'];
  const issuer = source['JWT_ISSUER'];
  if (!privateKeyPem || !publicKeyPem || !issuer) {
    throw new Error(
      'OAuth signing requires JWT_PRIVATE_KEY, JWT_PUBLIC_KEY and JWT_ISSUER to be set',
    );
  }
  const keys = {
    privateKeyPem: normalisePem(privateKeyPem),
    publicKeyPem: normalisePem(publicKeyPem),
    issuer,
    kid: source['JWT_KEY_ID'] ?? 'auth-1',
  };
  assertKeyPair(keys);
  return keys;
}

function normalisePem(pem: string): string {
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}

function assertKeyPair(keys: Pick<SigningKeys, 'privateKeyPem' | 'publicKeyPem'>): void {
  let derivedPublic: Buffer;
  try {
    derivedPublic = createPublicKey(createPrivateKey(keys.privateKeyPem)).export({ type: 'spki', format: 'der' });
  } catch (error: unknown) {
    throw new Error('JWT_PRIVATE_KEY is not a valid PEM private key', { cause: error });
  }
  let suppliedPublic: Buffer;
  try {
    suppliedPublic = createPublicKey(keys.publicKeyPem).export({ type: 'spki', format: 'der' });
  } catch (error: unknown) {
    throw new Error('JWT_PUBLIC_KEY is not a valid PEM public key', { cause: error });
  }
  if (!derivedPublic.equals(suppliedPublic)) {
    throw new Error('JWT_PUBLIC_KEY does not match JWT_PRIVATE_KEY');
  }
}

function isValidRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (url.protocol === 'https:' || url.protocol === 'http:') && url.hash === '' && !value.includes('#');
}

const redirectUriSchema = z
  .string()
  .min(1)
  .refine(isValidRedirectUri, { message: 'must be an absolute http(s) URL without a fragment' });

const registeredClientSchema = z.object({
  clientId: z.string().min(1),
  redirectUris: z.array(redirectUriSchema).min(1),
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

@Module({
  imports: [forwardRef(() => UsersModule), AuditModule],
  controllers: [OAuthController, AccountDeactivationController, AuthorizeController, LoginController, LoginAssetsController],
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
    { provide: SESSION_IDLE_TIMEOUT_MS, useFactory: (): number => readSessionIdleTimeoutMs() },
    { provide: TOKEN_STORES, useFactory: createTokenStores },
    { provide: TOKEN_STORE, useFactory: (stores: TokenStores): TokenStore => stores.store, inject: [TOKEN_STORES] },
    { provide: TOKEN_DENYLIST, useFactory: (stores: TokenStores): TokenDenylist => stores.denylist, inject: [TOKEN_STORES] },
    { provide: CLIENT_REGISTRY, useFactory: (): InMemoryClientRegistry => new InMemoryClientRegistry(loadRegisteredClients()) },
    // The issuer answers the guard layer's revocation question; exported so APP_GUARD's JwtAuthGuard sees it.
    { provide: TOKEN_REVOCATION, useExisting: TokenService },
  ],
  exports: [OAuthService, TokenService, TOKEN_REVOCATION],
})
export class OAuthModule {}
