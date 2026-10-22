import {
  CONSENTER_TYPES,
  CONSENT_SCAN_CONTENT_TYPES,
  CONSENT_SCAN_MAX_BYTES,
  CONSENT_STATUSES,
} from './consent.dto';

describe('consent contract constants', () => {
  it('should cap a scan at 10 MB when the limit is read', () => {
    expect(CONSENT_SCAN_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it('should accept exactly PDF, JPEG and PNG scans', () => {
    expect([...CONSENT_SCAN_CONTENT_TYPES].sort()).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
    ]);
  });

  it('should name the four consenter types of the paper form', () => {
    expect(CONSENTER_TYPES).toEqual(['self', 'legal-representative', 'guardian', 'relative']);
  });

  it('should expose the Consent statuses a response can carry', () => {
    expect(CONSENT_STATUSES).toEqual(['active', 'inactive', 'rejected', 'entered-in-error']);
  });
});
