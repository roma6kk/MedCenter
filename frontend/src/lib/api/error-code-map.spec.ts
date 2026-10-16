import { errorCodeMap, errorCodeToUx, errorMessageKey, isToastUx } from './error-code-map';
import { ERROR_CODES, type ErrorCode } from './problem';
import { LOCALES } from '@/lib/i18n/locale';
import { hasMessage } from '@/lib/i18n/translate';

describe('errorCodeMap', () => {
  it('should have exactly one UX entry per catalogue errorCode (20/20)', () => {
    expect(Object.keys(errorCodeMap).sort()).toEqual([...ERROR_CODES].sort());
    expect(ERROR_CODES).toHaveLength(20);
  });

  it('should return the same entry from errorCodeToUx as from the map', () => {
    for (const code of ERROR_CODES) {
      expect(errorCodeToUx(code)).toBe(errorCodeMap[code]);
    }
  });

  it('should render both FORBIDDEN codes as the forbidden page', () => {
    expect(errorCodeToUx('FORBIDDEN_ROLE')).toEqual({ kind: 'forbidden' });
    expect(errorCodeToUx('FORBIDDEN_SCOPE')).toEqual({ kind: 'forbidden' });
  });

  it('should show COMPARTMENT_VIOLATION as not-found, never as forbidden', () => {
    expect(errorCodeToUx('COMPARTMENT_VIOLATION')).toEqual({ kind: 'not-found' });
  });

  it('should refetch slots on SLOT_CONFLICT rather than show a generic banner', () => {
    expect(errorCodeToUx('SLOT_CONFLICT')).toEqual({ kind: 'slot-conflict' });
  });

  it.each([
    ['ROOM_IN_USE', 'room'],
    ['SERVICE_IN_USE', 'service'],
    ['SCHEDULE_IN_USE', 'schedule'],
  ] as const)('should map %s to an in-use conflict of the %s resource', (code, resource) => {
    expect(errorCodeToUx(code)).toEqual({ kind: 'in-use-conflict', resource });
  });

  it('should degrade an unknown code to the generic banner when the backend is newer than the client', () => {
    expect(errorCodeToUx('SOMETHING_NEW' as ErrorCode)).toEqual({ kind: 'banner-generic' });
  });

  it('should treat only the toast kinds as toasts', () => {
    const toastCodes = ERROR_CODES.filter((code) => isToastUx(errorCodeToUx(code))).sort();

    expect(toastCodes).toEqual(['RATE_LIMITED', 'SLOT_CONFLICT', 'TOKEN_REVOKED']);
  });

  it.each(LOCALES)('should have a %s message for every catalogue code', (locale) => {
    const missing = ERROR_CODES.filter((code) => !hasMessage(locale, errorMessageKey(code)));

    expect(missing).toEqual([]);
  });
});
