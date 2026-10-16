import {
  SmokeAssertionError,
  describe as describeResponse,
  expectEqual,
  expectPage,
  expectProblem,
  expectShape,
  expectStatus,
} from './smoke-assert';
import type { ApiResponse } from './smoke-types';

function response(status: number, body: unknown, contentType = 'application/json'): ApiResponse {
  return { status, contentType, text: body === undefined ? '' : JSON.stringify(body), body };
}

const PROBLEM = { type: 't', title: 'x', detail: 'd', instance: '/i', requestId: 'r', errorCode: 'SLOT_CONFLICT' };

describe('expectStatus', () => {
  it('should accept any of the allowed statuses', () => {
    expect(() => expectStatus(response(204, undefined), [200, 204])).not.toThrow();
  });

  it('should name the expected statuses and the answer when the status differs', () => {
    expect(() => expectStatus(response(500, { detail: 'boom' }), 201)).toThrow('expected HTTP 201, got HTTP 500 - boom');
  });
});

describe('expectShape', () => {
  it('should accept an object whose required fields have the declared types', () => {
    expect(() => expectShape({ id: 'a', count: 1, tags: [], meta: {} }, { id: 'string', count: 'number', tags: 'array', meta: 'object' }, 'x')).not.toThrow();
  });

  it('should fail with the field path when a required field is missing', () => {
    expect(() => expectShape({ id: 'a' }, { id: 'string', count: 'number' }, 'item')).toThrow('item.count: expected number, got undefined');
  });

  it('should fail when an optional field is present with the wrong type', () => {
    expect(() => expectShape({ note: 5 }, { note: 'string?' }, 'item')).toThrow('item.note: expected string, got number');
  });

  it('should accept an absent optional field', () => {
    expect(() => expectShape({}, { note: 'string?' }, 'item')).not.toThrow();
  });

  it('should treat null as its own type, not as an object', () => {
    expect(() => expectShape({ meta: null }, { meta: 'object' }, 'item')).toThrow('item.meta: expected object, got null');
  });

  it('should refuse a value that is not a JSON object', () => {
    expect(() => expectShape([], { id: 'string' }, 'item')).toThrow('item is not a JSON object');
  });
});

describe('expectPage', () => {
  const meta = { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 };

  it('should return the items of a PaginatedResponseDto', () => {
    expect(expectPage(response(200, { items: [{ id: 'a' }], meta }), { id: 'string' })).toEqual([{ id: 'a' }]);
  });

  it('should refuse a bare array: lists are enveloped', () => {
    expect(() => expectPage(response(200, [{ id: 'a' }]))).toThrow(/is not a JSON object/);
  });

  it('should refuse an envelope without meta', () => {
    expect(() => expectPage(response(200, { items: [] }))).toThrow(/meta/);
  });

  it('should refuse an item that does not match the item shape', () => {
    expect(() => expectPage(response(200, { items: [{ id: 1 }], meta }), { id: 'string' })).toThrow('items[0].id: expected string, got number');
  });
});

describe('expectProblem', () => {
  it('should accept an RFC 7807 problem with the expected status and errorCode', () => {
    expect(() => expectProblem(response(409, PROBLEM, 'application/problem+json'), 409, 'SLOT_CONFLICT')).not.toThrow();
  });

  it('should refuse an error body that is not application/problem+json', () => {
    expect(() => expectProblem(response(409, PROBLEM), 409, 'SLOT_CONFLICT')).toThrow('not application/problem+json');
  });

  it('should refuse another errorCode than the catalogued one', () => {
    expect(() => expectProblem(response(409, { ...PROBLEM, errorCode: 'CONFLICT' }, 'application/problem+json'), 409, 'SLOT_CONFLICT')).toThrow(/expected "SLOT_CONFLICT", got "CONFLICT"/);
  });

  it('should refuse a problem without the correlation id', () => {
    const { requestId: _omitted, ...incomplete } = PROBLEM;

    expect(() => expectProblem(response(409, incomplete, 'application/problem+json'), 409, 'SLOT_CONFLICT')).toThrow('problem.requestId');
  });
});

describe('expectEqual and describe', () => {
  it('should print both values when they differ', () => {
    expect(() => expectEqual('a', 'b', 'label')).toThrow('label: expected "b", got "a"');
  });

  it('should trim a long error detail to one line in the failure description', () => {
    const long = { errorCode: 'INTERNAL', detail: `${'x'.repeat(1000)}\nsecond line` };

    const text = describeResponse(response(500, long));

    expect(text.length).toBeLessThan(300);
    expect(text).toMatch(/^HTTP 500 INTERNAL - x+$/);
  });

  it('should print only the errorCode and detail of an error answer, nothing else of its body', () => {
    const body = { ...PROBLEM, detail: 'slot is not free', email: 'patient@medcenter.test', token: 'secret-token' };

    const text = describeResponse(response(409, body, 'application/problem+json'));

    expect(text).toBe('HTTP 409 SLOT_CONFLICT - slot is not free');
  });

  it('should not echo the body of a 2xx answer, which carries names and emails', () => {
    const text = describeResponse(response(200, { fullName: 'Павел Кузнецов', email: 'patient.kuznetsov@medcenter.test' }));

    expect(text).toMatch(/^HTTP 200 \(application\/json, \d+ bytes\)$/);
    expect(text).not.toContain('Кузнецов');
    expect(text).not.toContain('@');
  });

  it('should reduce an error answer without errorCode or detail to its type and size', () => {
    const html: ApiResponse = { status: 502, contentType: 'text/html', text: '<html>bad gateway</html>', body: undefined };

    expect(describeResponse(html)).toBe('HTTP 502 (text/html, 24 bytes)');
  });

  it('should say only the status when the answer has no body', () => {
    expect(describeResponse(response(204, undefined))).toBe('HTTP 204');
    expect(new SmokeAssertionError('m')).toBeInstanceOf(Error);
  });
});
