/**
 * Minimal cookie jar for one programmatic login: auth-service keeps two
 * short-lived cookies on `/oauth` (`mc_as_csrf` on the form, `mc_as_session`
 * after the credentials are accepted), and a hand-rolled client has to carry
 * them from response to request itself. Attributes (`Path`, `SameSite`,
 * `Secure`) are ignored on purpose — every request goes to the one origin the
 * tool was pointed at; only expiry matters, because the server clears the CSRF
 * cookie by expiring it.
 */
export class OAuthCookieJar {
  private readonly cookies = new Map<string, string>();

  /** Stores every `Set-Cookie` of the response; an expired or empty cookie removes the entry. */
  store(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair = '', ...attributes] = header.split(';').map((part) => part.trim());
      const separator = pair.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value.length === 0 || isExpired(attributes)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  has(name: string): boolean {
    return this.cookies.has(name);
  }

  /** Value of the `Cookie` request header, `''` when the jar is empty. */
  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

function isExpired(attributes: readonly string[]): boolean {
  for (const attribute of attributes) {
    const [name = '', value = ''] = attribute.split('=');
    if (name.toLowerCase() === 'max-age' && Number(value) <= 0) {
      return true;
    }
    if (name.toLowerCase() === 'expires' && Date.parse(value) <= Date.now()) {
      return true;
    }
  }
  return false;
}
