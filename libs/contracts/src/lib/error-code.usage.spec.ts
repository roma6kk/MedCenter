import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ERROR_CODE_HTTP_STATUS, ERROR_CODES } from './error-code';

const WORKSPACE_ROOT = resolve(__dirname, '../../../..');
const SOURCE_ROOTS = ['apps', 'libs'];
/** `errorCode: 'SOME_CODE'` written as a literal in production code. */
const ERROR_CODE_LITERAL = /errorCode:\s*'([A-Za-z0-9_]+)'/g;
const NON_PRODUCTION = /(\.spec\.ts|\.e2e-spec\.ts|\.test\.ts)$|(^|\/)(__tests__|test|node_modules|dist)(\/|$)/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === 'dist' ? [] : sourceFiles(path);
    }
    return entry.name.endsWith('.ts') && !NON_PRODUCTION.test(path.slice(WORKSPACE_ROOT.length)) ? [path] : [];
  });
}

function literalsIn(path: string): string[] {
  return [...readFileSync(path, 'utf8').matchAll(ERROR_CODE_LITERAL)].map((match) => match[1] ?? '');
}

function productionCodeLiterals(): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, string[]>();
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(join(WORKSPACE_ROOT, root))) {
      for (const code of literalsIn(file)) {
        found.set(code, [...(found.get(code) ?? []), file.slice(WORKSPACE_ROOT.length + 1)]);
      }
    }
  }
  return found;
}

/**
 * `ProblemDetailsFilter` promotes an `errorCode` to the response only when the
 * catalogue lists it; any other value silently becomes the status-derived code
 * (`409` -> `CONFLICT`). These cases keep the code a service throws and the
 * code the client sees the same.
 */
describe('ERROR_CODES usage across the workspace', () => {
  const literals = productionCodeLiterals();

  it('should find the error codes production code throws when the sources are scanned', () => {
    expect(literals.size).toBeGreaterThan(10);
    expect(literals.has('VALIDATION_ERROR')).toBe(true);
  });

  it('should list every errorCode literal production code throws in the catalogue when the sources are scanned', () => {
    // Arrange
    const catalogued = new Set<string>(ERROR_CODES);

    // Act
    const unknown = [...literals.entries()]
      .filter(([code]) => !catalogued.has(code))
      .map(([code, files]) => `${code} (${files[0]})`);

    // Assert
    expect(unknown).toEqual([]);
  });

  it.each(['ROOM_IN_USE', 'SERVICE_IN_USE', 'SCHEDULE_IN_USE'] as const)(
    'should be thrown by a service and catalogued as 409 when %s guards a delete',
    (code) => {
      expect(literals.has(code)).toBe(true);
      expect(ERROR_CODE_HTTP_STATUS[code]).toBe(409);
    },
  );
});

describe('ERROR_CODES shape', () => {
  it.each(ERROR_CODES)('should be UPPER_SNAKE_CASE when %s is declared', (code) => {
    expect(code).toMatch(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
  });

  it('should keep the generic code first for its status when several codes share it', () => {
    // Arrange — ProblemDetailsFilter derives the code of a plain exception from the first table entry of its status.
    const firstOfStatus = new Map<number, string>();
    for (const [code, status] of Object.entries(ERROR_CODE_HTTP_STATUS)) {
      if (!firstOfStatus.has(status)) {
        firstOfStatus.set(status, code);
      }
    }

    // Assert
    expect(firstOfStatus.get(400)).toBe('VALIDATION_ERROR');
    expect(firstOfStatus.get(401)).toBe('UNAUTHENTICATED');
    expect(firstOfStatus.get(404)).toBe('NOT_FOUND');
    expect(firstOfStatus.get(409)).toBe('CONFLICT');
    expect(firstOfStatus.get(429)).toBe('RATE_LIMITED');
    expect(firstOfStatus.get(500)).toBe('INTERNAL');
  });

  it('should answer every referenced-resource guard with the same 409 status when the in-use codes are compared', () => {
    const statuses = (['ROOM_IN_USE', 'SERVICE_IN_USE', 'SCHEDULE_IN_USE', 'SCHEDULE_OVERLAP', 'CONFLICT'] as const).map(
      (code) => ERROR_CODE_HTTP_STATUS[code],
    );

    expect(new Set(statuses)).toEqual(new Set([409]));
  });
});
