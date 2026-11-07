export class OAuthCookieJar {
  private readonly cookies = new Map<string, string>();

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
