/** Scope `POST /api/v1/admin/users` demands of the caller's token (`@RequiresScopes(USER_WRITE)`). */
const REQUIRED_ADMIN_SCOPE = 'user/*.write';

/**
 * Fails once, with the cause, when the OAuth server narrowed the admin grant
 * below what user management needs — typically the client registration
 * (`OAUTH_CLIENTS_JSON` `scopes`) lacks `user/*.write`. Without this the run
 * ends in one opaque 403 per account. A response that reports no scope is
 * not judged.
 */
export function assertAdminGrant(clientId: string, grantedScope: string | undefined): void {
  if (grantedScope === undefined || grantedScope.split(' ').includes(REQUIRED_ADMIN_SCOPE)) {
    return;
  }
  throw new Error(
    `The admin token carries the scope "${grantedScope}" but creating users needs ${REQUIRED_ADMIN_SCOPE}: ` +
      `register ${REQUIRED_ADMIN_SCOPE} in the scopes of OAuth client "${clientId}" (OAUTH_CLIENTS_JSON).`,
  );
}
