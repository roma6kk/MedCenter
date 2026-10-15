import { deriveLoginKeys } from '../login/login-keys';
import { LoginPageResponder } from '../login/login-page.responder';
import { LoginSessionService } from '../login/login-session.service';
import { InMemoryTokenDenylist } from '../token.service';
import { createOAuthHarness, type OAuthHarness } from './oauth-harness';

export interface LoginHarness extends OAuthHarness {
  readonly sessions: LoginSessionService;
  readonly page: LoginPageResponder;
}

/** `OAuthHarness` plus the login-session pieces of assumption UI-1, all in memory. */
export function createLoginHarness(): LoginHarness {
  const oauth = createOAuthHarness();
  const sessions = new LoginSessionService(deriveLoginKeys('test-session-secret-0123456789abcdef'), new InMemoryTokenDenylist());
  return { ...oauth, sessions, page: new LoginPageResponder(sessions) };
}
