const REQUIRED_ADMIN_SCOPE = 'user/*.write';

export function assertAdminGrant(clientId: string, grantedScope: string | undefined): void {
  if (grantedScope === undefined || grantedScope.split(' ').includes(REQUIRED_ADMIN_SCOPE)) {
    return;
  }
  throw new Error(
    `The admin token carries the scope "${grantedScope}" but creating users needs ${REQUIRED_ADMIN_SCOPE}: ` +
      `register ${REQUIRED_ADMIN_SCOPE} in the scopes of OAuth client "${clientId}" (OAUTH_CLIENTS_JSON).`,
  );
}
