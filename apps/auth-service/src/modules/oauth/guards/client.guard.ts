import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

import { OAuthError } from '../oauth-error';

export interface RegisteredClient {
  readonly clientId: string;
  readonly redirectUris: ReadonlyArray<string>;
  readonly scopes: ReadonlyArray<string>;
  readonly isPublic: boolean;
  /**
   * Secret for confidential clients (`isPublic === false`). The dev registry
   * holds it as configured; the TypeORM-backed registry compares against the
   * bcrypt `auth.oauth_client.client_secret_hash` column instead.
   */
  readonly clientSecret?: string;
}

export interface ClientRegistry {
  find(clientId: string): Promise<RegisteredClient | null>;
  /** True when the presented secret authenticates the client. Fails closed. */
  verifySecret(client: RegisteredClient, presented: string | undefined): boolean;
}

export const CLIENT_REGISTRY = 'CLIENT_REGISTRY';

/** Dev/test registry. The `auth.oauth_client`-backed one is wired with persistence. */
export class InMemoryClientRegistry implements ClientRegistry {
  private readonly byId = new Map<string, RegisteredClient>();

  constructor(clients: ReadonlyArray<RegisteredClient> = []) {
    for (const client of clients) {
      this.byId.set(client.clientId, client);
    }
  }

  async find(clientId: string): Promise<RegisteredClient | null> {
    return this.byId.get(clientId) ?? null;
  }

  /**
   * Public clients authenticate with PKCE alone, so they need no secret. A
   * confidential client without a configured secret can never authenticate —
   * failing closed is the only safe default.
   */
  verifySecret(client: RegisteredClient, presented: string | undefined): boolean {
    if (client.isPublic) {
      return true;
    }
    const expected = client.clientSecret;
    if (expected === undefined || expected.length === 0 || presented === undefined) {
      return false;
    }
    const expectedBytes = Buffer.from(expected);
    const presentedBytes = Buffer.from(presented);

    return (
      expectedBytes.length === presentedBytes.length && timingSafeEqual(expectedBytes, presentedBytes)
    );
  }
}

/** A `redirect_uri` that is not registered must never receive an authorization code. */
export function assertRegisteredRedirectUri(client: RegisteredClient, redirectUri: string): void {
  if (!client.redirectUris.includes(redirectUri)) {
    throw OAuthError.invalidRequest('redirect_uri is not registered for this client');
  }
}

export interface RequestWithClientQuery {
  readonly query: Record<string, unknown>;
  client?: RegisteredClient;
}

function readQueryString(query: Record<string, unknown>, key: string): string {
  const value = query[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Resolves and authenticates the OAuth client of an authorize request
 * (API 2.1.2). An unknown `client_id` is `401 invalid_client`; an unregistered
 * `redirect_uri` is rejected without redirecting anywhere.
 */
@Injectable()
export class ClientGuard implements CanActivate {
  constructor(@Inject(CLIENT_REGISTRY) private readonly registry: ClientRegistry) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithClientQuery>();
    const clientId = readQueryString(request.query, 'client_id');
    const redirectUri = readQueryString(request.query, 'redirect_uri');
    const client = clientId.length > 0 ? await this.registry.find(clientId) : null;
    if (client === null) {
      throw OAuthError.invalidClient('Unknown client_id');
    }
    if (redirectUri.length > 0) {
      assertRegisteredRedirectUri(client, redirectUri);
    }
    request.client = client;
    return true;
  }
}
