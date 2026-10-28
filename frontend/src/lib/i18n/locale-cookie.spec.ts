import { LOCALE_COOKIE, readLocaleCookie, writeLocaleCookie } from './locale';

function clearCookie(): void {
  document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`;
}

describe('locale cookie', () => {
  beforeEach(clearCookie);

  it('should be absent until the viewer has chosen', () => {
    expect(readLocaleCookie()).toBeNull();
  });

  it('should round-trip the chosen locale', () => {
    writeLocaleCookie('en');
    expect(readLocaleCookie()).toBe('en');

    writeLocaleCookie('ru');
    expect(readLocaleCookie()).toBe('ru');
  });

  it('should ignore a junk value', () => {
    document.cookie = `${LOCALE_COOKIE}=xx; path=/`;
    expect(readLocaleCookie()).toBeNull();
  });
});
