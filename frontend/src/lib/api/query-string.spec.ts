import { buildQueryString, withQuery } from './query-string';

describe('buildQueryString', () => {
  it('should serialise strings, numbers and booleans', () => {
    expect(buildQueryString({ page: 2, pageSize: 20, unread: true, search: 'иванов' })).toBe('?page=2&pageSize=20&unread=true&search=%D0%B8%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2');
  });

  it('should drop unset, null and empty values so an empty filter never reaches the DTO whitelist', () => {
    expect(buildQueryString({ role: undefined, search: '', status: null, page: 1 })).toBe('?page=1');
  });

  it('should keep a zero and a false', () => {
    expect(buildQueryString({ offset: 0, unread: false })).toBe('?offset=0&unread=false');
  });

  it('should be empty when there is nothing to send', () => {
    expect(buildQueryString({})).toBe('');
    expect(buildQueryString()).toBe('');
  });

  it('should refuse a patient parameter because the patient comes from the token (ADR-013)', () => {
    expect(() => buildQueryString({ patient: 'Patient/1' })).toThrow(/ADR-013/);
  });
});

describe('withQuery', () => {
  it('should append the query to the path', () => {
    expect(withQuery('/api/v1/notifications', { page: 1 })).toBe('/api/v1/notifications?page=1');
  });

  it('should leave the path alone without params', () => {
    expect(withQuery('/api/v1/doctors')).toBe('/api/v1/doctors');
  });
});
