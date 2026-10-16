import { isErrorCode, networkProblem, parseProblem, parseRetryAfter, statusToErrorCode } from './problem-parse';

function response(status: number, headers: Record<string, string> = {}): Pick<Response, 'status' | 'headers'> {
  return { status, headers: new Headers(headers) };
}

describe('parseProblem', () => {
  it('should map a problem+json body of the BFF field for field', () => {
    const body = {
      type: 'https://api.medcenter.by/errors/slot-conflict',
      title: 'Slot conflict',
      status: 409,
      detail: 'Slot 7c9e is busy',
      instance: '/api/v1/appointments',
      requestId: '01J9ZK3M8Q',
      errorCode: 'SLOT_CONFLICT',
    };

    expect(parseProblem(response(409), body)).toEqual(expect.objectContaining(body));
  });

  it('should keep every violated constraint of a VALIDATION_ERROR in details', () => {
    const body = {
      title: 'BadRequestException',
      errorCode: 'VALIDATION_ERROR',
      details: [
        { field: 'email', message: 'email must be an email' },
        { field: 'lastName', message: 'lastName should not be empty' },
        { field: 'lastName', message: 'lastName must be a string' },
      ],
    };

    expect(parseProblem(response(400), body).details).toEqual(body.details);
  });

  it('should drop malformed detail entries instead of rendering "undefined"', () => {
    const body = { errorCode: 'VALIDATION_ERROR', details: [{ field: 'email' }, null, 'x', { field: '', message: 'm' }, { field: 'a', message: 'b' }] };

    expect(parseProblem(response(400), body).details).toEqual([{ field: 'a', message: 'b' }]);
  });

  it('should take the HTTP status over the status in the body', () => {
    expect(parseProblem(response(409), { status: 500, errorCode: 'CONFLICT' }).status).toBe(409);
  });

  it('should fall back to the status when the errorCode is one the client does not know', () => {
    expect(parseProblem(response(409), { errorCode: 'SOMETHING_NEW' }).errorCode).toBe('CONFLICT');
  });

  it('should synthesize a problem from an HTML edge error that has no JSON body', () => {
    const problem = parseProblem(response(502), undefined);

    expect(problem).toEqual(expect.objectContaining({ status: 502, errorCode: 'INTERNAL', title: 'Внутренняя ошибка' }));
  });

  it('should read the request id from the X-Request-Id header when the body has none', () => {
    expect(parseProblem(response(500, { 'x-request-id': 'req-9' }), {}).requestId).toBe('req-9');
  });

  it('should read Retry-After seconds from a 429', () => {
    expect(parseProblem(response(429, { 'retry-after': '30' }), { errorCode: 'RATE_LIMITED' }).retryAfter).toBe(30);
  });

  it('should leave retryAfter out when the header is absent', () => {
    expect(parseProblem(response(429), { errorCode: 'RATE_LIMITED' })).not.toHaveProperty('retryAfter');
  });

  it('should join the message array of a plain NestJS error into the detail', () => {
    expect(parseProblem(response(400), { message: ['a must be a string', 'b is required'] }).detail).toBe('a must be a string; b is required');
  });

  it('should tolerate a response double without headers', () => {
    expect(parseProblem({ status: 500 } as Pick<Response, 'status' | 'headers'>, {}).errorCode).toBe('INTERNAL');
  });
});

describe('statusToErrorCode', () => {
  it.each([
    [400, 'VALIDATION_ERROR'],
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN_ROLE'],
    [404, 'NOT_FOUND'],
    [405, 'METHOD_NOT_ALLOWED'],
    [409, 'CONFLICT'],
    [422, 'VALIDATION_ERROR'],
    [429, 'RATE_LIMITED'],
    [500, 'INTERNAL'],
    [502, 'INTERNAL'],
    [0, 'INTERNAL'],
  ])('should map status %i to %s', (status, code) => {
    expect(statusToErrorCode(status)).toBe(code);
  });
});

describe('parseRetryAfter', () => {
  const NOW = Date.parse('2026-10-16T10:00:00Z');

  it('should round fractional seconds up', () => {
    expect(parseRetryAfter('1.2')).toBe(2);
  });

  it('should convert an HTTP date into seconds from now', () => {
    expect(parseRetryAfter('Fri, 16 Oct 2026 10:00:45 GMT', NOW)).toBe(45);
  });

  it('should not report a negative wait for a date in the past', () => {
    expect(parseRetryAfter('Fri, 16 Oct 2026 09:00:00 GMT', NOW)).toBe(0);
  });

  it.each([[null], [undefined], [''], ['soon'], ['-5']])('should ignore %p', (raw) => {
    expect(parseRetryAfter(raw, NOW)).toBeUndefined();
  });
});

describe('isErrorCode and networkProblem', () => {
  it('should recognise the three in-use codes added by the platform fixes', () => {
    ['ROOM_IN_USE', 'SERVICE_IN_USE', 'SCHEDULE_IN_USE'].forEach((code) => expect(isErrorCode(code)).toBe(true));
  });

  it('should reject a non-catalogue value', () => {
    expect(isErrorCode('nope')).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
  });

  it('should describe a request that got no response as status 0', () => {
    expect(networkProblem()).toMatchObject({ status: 0, errorCode: 'INTERNAL' });
  });
});
