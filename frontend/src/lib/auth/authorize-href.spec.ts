import { AUTHORIZE_PATH, authorizeHref } from './authorize-href';

describe('authorizeHref', () => {
  it('should be the bare authorize route when no page was asked for', () => {
    expect(authorizeHref('')).toBe(AUTHORIZE_PATH);
  });

  it('should carry the page to return to, encoded, when one was asked for', () => {
    expect(authorizeHref('/appointments?page=2')).toBe('/api/auth/authorize?returnTo=%2Fappointments%3Fpage%3D2');
  });
});
