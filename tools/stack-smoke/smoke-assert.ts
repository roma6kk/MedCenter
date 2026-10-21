import type { ApiResponse, JsonObject } from './smoke-types';

/** A violated expectation: the message says what was expected and what the stack answered. */
export class SmokeAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmokeAssertionError';
  }
}

const EXCERPT_LENGTH = 240;
const FIRST_ERROR_STATUS = 400;

/** `errorCode` and `detail` of an error body (RFC 7807 or the like); nothing else of it. */
function errorFieldsOf(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return '';
  }
  const { errorCode, detail } = body as { errorCode?: unknown; detail?: unknown };
  const code = typeof errorCode === 'string' ? ` ${errorCode}` : '';
  const text = typeof detail === 'string' ? ` - ${detail.replace(/\s+/g, ' ').slice(0, EXCERPT_LENGTH)}` : '';
  return `${code}${text}`;
}

/**
 * The answer in one line, for failure messages. An error answer shows its `errorCode` and `detail` only; any
 * other body is reduced to its type and size, because a 2xx body carries names and emails (PII) and must not
 * reach a log just because the status was not the expected one.
 */
export function describe(response: ApiResponse): string {
  const fields = response.status >= FIRST_ERROR_STATUS ? errorFieldsOf(response.body) : '';
  if (fields.length > 0) {
    return `HTTP ${response.status}${fields}`;
  }
  const bytes = Buffer.byteLength(response.text);
  return `HTTP ${response.status}${bytes === 0 ? '' : ` (${response.contentType || 'untyped'}, ${bytes} bytes)`}`;
}

export function expectTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new SmokeAssertionError(message);
  }
}

export function expectEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new SmokeAssertionError(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Narrows a value that a previous step should have produced. */
export function expectDefined<T>(value: T | undefined | null, label: string): T {
  if (value === undefined || value === null) {
    throw new SmokeAssertionError(`${label} is missing (a previous step did not produce it)`);
  }
  return value;
}

export function expectStatus(response: ApiResponse, status: number | readonly number[]): void {
  const allowed = typeof status === 'number' ? [status] : status;
  if (!allowed.includes(response.status)) {
    throw new SmokeAssertionError(`expected HTTP ${allowed.join(' or ')}, got ${describe(response)}`);
  }
}

export function asObject(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SmokeAssertionError(`${label} is not a JSON object`);
  }
  return value as JsonObject;
}

export function asArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new SmokeAssertionError(`${label} is not a JSON array`);
  }
  return value as readonly unknown[];
}

/** The JSON object body of a response, after the status was checked by the caller. */
export function bodyObject(response: ApiResponse): JsonObject {
  return asObject(response.body, `the body of ${describe(response)}`);
}

export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/** `'string?'` marks an optional field: absent is fine, present must have the type. */
export type FieldSpec = Readonly<Record<string, FieldType | `${FieldType}?`>>;

function typeOf(value: unknown): FieldType | 'null' | 'undefined' {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value as FieldType | 'undefined';
}

/** Every field of `spec` is present (unless optional) and has the declared JSON type. */
export function expectShape(value: unknown, spec: FieldSpec, label: string): JsonObject {
  const object = asObject(value, label);
  for (const [key, declared] of Object.entries(spec)) {
    const optional = declared.endsWith('?');
    const expected = optional ? declared.slice(0, -1) : declared;
    const actual = typeOf(object[key]);
    if (actual === 'undefined' && optional) {
      continue;
    }
    if (actual !== expected) {
      throw new SmokeAssertionError(`${label}.${key}: expected ${expected}, got ${actual}`);
    }
  }
  return object;
}

const PAGE_META: FieldSpec = { page: 'number', pageSize: 'number', totalItems: 'number', totalPages: 'number' };

/** `PaginatedResponseDto`: `{ items: [], meta: { page, pageSize, totalItems, totalPages } }`. */
export function expectPage(response: ApiResponse, itemSpec?: FieldSpec): readonly JsonObject[] {
  expectStatus(response, 200);
  const body = bodyObject(response);
  const items = asArray(body['items'], 'items');
  expectShape(body['meta'], PAGE_META, 'meta');
  return items.map((item, index) => (itemSpec === undefined ? asObject(item, `items[${index}]`) : expectShape(item, itemSpec, `items[${index}]`)));
}

/** RFC 7807 problem: status, `application/problem+json` and the catalogued `errorCode` (API §1). */
export function expectProblem(response: ApiResponse, status: number, errorCode: string): void {
  expectStatus(response, status);
  expectTrue(response.contentType.includes('problem+json'), `error body is ${response.contentType || 'untyped'}, not application/problem+json`);
  const problem = expectShape(response.body, { type: 'string', title: 'string', detail: 'string', instance: 'string', requestId: 'string', errorCode: 'string' }, 'problem');
  expectEqual(problem['errorCode'], errorCode, `errorCode of ${describe(response)}`);
}

/** The `details[]` entry of a problem that names `field` (API §1: request path such as `diagnoses.1.code`). */
export function expectDetailField(response: ApiResponse, field: string): JsonObject {
  const details = asArray(bodyObject(response)['details'], 'details').map((entry, index) => expectShape(entry, { field: 'string', message: 'string' }, `details[${index}]`));
  const entry = details.find((candidate) => candidate['field'] === field);
  if (entry === undefined) {
    throw new SmokeAssertionError(`details[] has no field ${JSON.stringify(field)} (got ${details.map((candidate) => String(candidate['field'])).join(', ') || 'none'})`);
  }
  return entry;
}
