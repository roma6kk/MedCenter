import type { ClientRegistry } from '../guards/client.guard';

/**
 * The form's authorization request must still name a registered client and,
 * when present, one of its registered redirect URIs — otherwise there is no
 * trustworthy place to send the user (nor a registration link to show).
 */
export async function resolveRedirectUri(clients: ClientRegistry, authorizeQuery: string): Promise<string | null> {
  const params = new URLSearchParams(authorizeQuery);
  const clientId = params.get('client_id') ?? '';
  const client = clientId.length > 0 ? await clients.find(clientId) : null;
  if (client === null) {
    return null;
  }
  const requested = params.get('redirect_uri');
  if (requested === null) {
    return client.redirectUris[0] ?? null;
  }
  return client.redirectUris.includes(requested) ? requested : null;
}
