import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

import { OAuthError } from '../oauth-error';

export interface RegisteredClient {
  readonly clientId: string;
  readonly redirectUris: ReadonlyArray<string>;
  readonly scopes: ReadonlyArray<string>;
  readonly isPublic: boolean;
  readonly clientSecret?: string;
}

export interface ClientRegistry {
  find(clientId: string): Promise<RegisteredClient | null>;
  verifySecret(client: RegisteredClient, presented: string | undefined): boolean;
}

export const CLIENT_REGISTRY = 'CLIENT_REGISTRY';

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

  // A confidential client without a configured secret can never authenticate: fail closed.
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

// An unregistered redirect_uri must never receive an authorization code.
export function assertRegisteredRedirectUri(client: RegisteredClient, redirectUri: string): void {
  if (!client.redirectUris.includes(redirectUri)) {
    throw OAuthError.invalidRequest('redirect_uri is not registered for this client');
  }
}

interface RequestWithClientQuery {
  readonly query: Record<string, unknown>;
  client?: RegisteredClient;
}

export function readQueryString(query: Record<string, unknown>, key: string): string {
  const value = query[key];
  return typeof value === 'string' ? value : '';
}

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
