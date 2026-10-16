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

  it('should know every backend code when the client catalogue is compared with the backend one', () => {
    // Arrange
    const known = new Set<string>(client);

    // Act
    const missingOnClient = ERROR_CODES.filter((code) => !known.has(code));

    // Assert — a backend code without a client entry would have no UX mapping.
    expect(missingOnClient).toEqual([]);
  });
});
