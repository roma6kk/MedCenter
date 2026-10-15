import { ERROR_CODE_HTTP_STATUS, ERROR_CODES, ErrorCode } from './error-code';

describe('ERROR_CODES', () => {
  it('should expose exactly the 20 API error codes when the catalogue is read', () => {
    expect(ERROR_CODES).toHaveLength(20);
  });

  it('should declare no duplicate code when every entry is collected', () => {
    const uniqueCodes = new Set<string>(ERROR_CODES);

    expect(uniqueCodes.size).toBe(ERROR_CODES.length);
  });

  it('should map every error code to an HTTP status when the table is walked', () => {
    const mappedCodes = Object.keys(ERROR_CODE_HTTP_STATUS) as ErrorCode[];

    expect([...mappedCodes].sort()).toEqual([...ERROR_CODES].sort());
  });

  it('should return 400 for VALIDATION_ERROR when the status is read', () => {
    expect(ERROR_CODE_HTTP_STATUS.VALIDATION_ERROR).toBe(400);
  });

  it('should return 401 for TOKEN_REVOKED when the status is read', () => {
    expect(ERROR_CODE_HTTP_STATUS.TOKEN_REVOKED).toBe(401);
  });

  it('should return 403 for COMPARTMENT_VIOLATION when the status is read', () => {
    expect(ERROR_CODE_HTTP_STATUS.COMPARTMENT_VIOLATION).toBe(403);
  });

  it('should return 404 for NOT_FOUND when the status is read', () => {
    expect(ERROR_CODE_HTTP_STATUS.NOT_FOUND).toBe(404);
  });

  it('should return 405 for METHOD_NOT_ALLOWED when the status is read', () => {
    expect(ERROR_CODE_HTTP_STATUS.METHOD_NOT_ALLOWED).toBe(405);
  });

  it('should return 409 for CONFLICT when the status is read', () => {
    expect(ERROR_CODE_HTTP_STATUS.CONFLICT).toBe(409);
  });

  it('should return 409 for SLOT_CONFLICT when the status is read', () => {
    expect(ERROR_CODE_HTTP_STATUS.SLOT_CONFLICT).toBe(409);
  });

  it.each(['ROOM_IN_USE', 'SERVICE_IN_USE', 'SCHEDULE_IN_USE'] as const)(
    'should list %s and map it to 409 when an admin delete hits a referenced resource',
    (code) => {
      expect(ERROR_CODES).toContain(code);
      expect(ERROR_CODE_HTTP_STATUS[code]).toBe(409);
    },
  );

  it('should return 422 for INVALID_ICD10_CODE when the status is read', () => {
    expect(ERROR_CODE_HTTP_STATUS.INVALID_ICD10_CODE).toBe(422);
  });

  it('should return 429 for RATE_LIMITED when the status is read', () => {
    expect(ERROR_CODE_HTTP_STATUS.RATE_LIMITED).toBe(429);
  });

  it('should return 500 for INTERNAL when the status is read', () => {
    expect(ERROR_CODE_HTTP_STATUS.INTERNAL).toBe(500);
  });

  it('should return only 4xx and 5xx statuses when every mapped value is collected', () => {
    const statuses = Object.values(ERROR_CODE_HTTP_STATUS);

    expect(statuses.every((status) => status >= 400 && status < 600)).toBe(true);
  });
});