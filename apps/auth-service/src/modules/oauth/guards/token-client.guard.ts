import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { OAuthError } from '../oauth-error';
import { CLIENT_REGISTRY, type ClientRegistry, type RegisteredClient } from './client.guard';

export interface RequestWithClientBody {
  readonly body?: Record<string, unknown>;
  client?: RegisteredClient;
}

function readBodyString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' ? value : undefined;
}

@Injectable()
export class TokenClientGuard implements CanActivate {
  constructor(@Inject(CLIENT_REGISTRY) private readonly registry: ClientRegistry) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithClientBody>();
    const body = request.body ?? {};
    const clientId = readBodyString(body, 'client_id');
    if (clientId === undefined || clientId.length === 0) {
      throw OAuthError.invalidClient('client_id is required');
    }

    const client = await this.registry.find(clientId);
    if (client === null) {
      throw OAuthError.invalidClient('Unknown client_id');
    }
    if (!this.registry.verifySecret(client, readBodyString(body, 'client_secret'))) {
      throw OAuthError.invalidClient('Client authentication failed');
    }

    request.client = client;
    return true;
  }
}
