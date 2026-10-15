import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { IDENTITY_RESOLVER, toIdentityClaims, type IdentityClaims, type IdentityResolver } from '../identity';
import { LOGIN_SESSION_COOKIE, readCookie, type CookieRequest } from './login-cookies';
import { LoginSessionService } from './login-session.service';

/** The account a login session belongs to, as it is *now* in the `auth` schema. */
export interface AuthorizePrincipal {
  readonly sessionId: string;
  readonly userId: string;
  readonly claims: IdentityClaims;
}

export interface RequestWithLoginSession extends CookieRequest {
  principal?: AuthorizePrincipal;
}

/**
 * Principal resolution of `GET /oauth/authorize`: reads the authorization
 * server's login-session cookie and resolves the account behind it. It never
 * rejects — no (valid) session simply leaves `principal` unset and the
 * controller renders the login form. A session of an account deactivated in
 * the meantime resolves to no principal, so it cannot obtain a code.
 *
 * Bearer tokens are deliberately *not* a principal source here: the route is
 * `@Public()`, and a SMART access token is not proof of an interactive login.
 */
@Injectable()
export class LoginSessionGuard implements CanActivate {
  constructor(
    private readonly sessions: LoginSessionService,
    @Inject(IDENTITY_RESOLVER) private readonly identities: IdentityResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithLoginSession>();
    const session = await this.sessions.read(readCookie(request, LOGIN_SESSION_COOKIE));
    if (session === null) {
      return true;
    }
    const identity = await this.identities.resolve(session.userId);
    if (identity !== null) {
      request.principal = { sessionId: session.sessionId, userId: identity.userId, claims: toIdentityClaims(identity) };
    }
    return true;
  }
}
