import { errorCodeMap, errorCodeToUx } from './error-code-map';
import { ERROR_CODES } from './problem';

describe('errorCodeMap', () => {
  it('should have exactly one UX entry per catalog errorCode (17/17)', () => {
    expect(Object.keys(errorCodeMap).sort()).toEqual([...ERROR_CODES].sort());
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

  it('should carry a non-empty logout message on TOKEN_REVOKED', () => {
    const ux = errorCodeToUx('TOKEN_REVOKED');
    expect(ux.kind).toBe('logout-toast');
    if (ux.kind === 'logout-toast') expect(ux.message.length).toBeGreaterThan(0);
  });
});
