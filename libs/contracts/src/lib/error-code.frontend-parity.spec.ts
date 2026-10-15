import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ERROR_CODES } from './error-code';

/** The client keeps its own copy of the catalogue (`frontend/` is a separate package without a path to `libs/`). */
const FRONTEND_CATALOGUE = resolve(__dirname, '../../../../frontend/src/lib/api/problem.ts');

function frontendCodes(): readonly string[] {
  const source = readFileSync(FRONTEND_CATALOGUE, 'utf8');
  const list = /export const ERROR_CODES = \[([\s\S]*?)\] as const;/.exec(source)?.[1] ?? '';
  return [...list.matchAll(/'([A-Z0-9_]+)'/g)].map((match) => match[1] ?? '');
}

/**
 * The backend answers with the codes of `ERROR_CODES`; the client types and maps
 * `ProblemDetails.errorCode` with its copy. A code the client does not know has
 * no UX entry (`errorCodeToUx` would return `undefined` for it).
 */
describe('ERROR_CODES parity with the frontend copy', () => {
  const client = frontendCodes();

  it('should find the client catalogue when frontend/src/lib/api/problem.ts is read', () => {
    expect(client.length).toBeGreaterThan(10);
  });

  it('should list every client code in the backend catalogue when the two copies are compared', () => {
    // Arrange
    const catalogued = new Set<string>(ERROR_CODES);

    // Act
    const unknownToBackend = client.filter((code) => !catalogued.has(code));

    // Assert — a renamed or mistyped code on the client side would never match a response.
    expect(unknownToBackend).toEqual([]);
  });

  /**
   * KNOWN GAP (tasks/TASK-001/test-generator-platform-report.md): ROOM_IN_USE,
   * SERVICE_IN_USE and SCHEDULE_IN_USE are emitted since the platform fixes but
   * the client copy (17 codes) and its UX map do not list them. The case stays
   * green while the gap exists; when the frontend adds the three codes it fails
   * with "Failing test passed" - drop `.failing` then.
   */
  it.failing('should know every backend code when the client catalogue is compared with the backend one', () => {
    // Arrange
    const known = new Set<string>(client);

    // Act
    const missingOnClient = ERROR_CODES.filter((code) => !known.has(code));

    // Assert
    expect(missingOnClient).toEqual([]);
  });

  it('should miss exactly the three in-use codes on the client when the gap is measured', () => {
    // Arrange
    const known = new Set<string>(client);

    // Act
    const missingOnClient = ERROR_CODES.filter((code) => !known.has(code));

    // Assert — pins the size of the gap so it cannot grow unnoticed; delete this case together with `.failing` above.
    expect([...missingOnClient].sort()).toEqual(['ROOM_IN_USE', 'SCHEDULE_IN_USE', 'SERVICE_IN_USE']);
  });
});
