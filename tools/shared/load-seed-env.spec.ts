import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSeedEnv } from './load-seed-env';

function dirWith(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'seed-env-'));
  writeFileSync(join(dir, '.env'), content);
  return dir;
}

describe('loadSeedEnv', () => {
  it('takes only the seed variables, and never overrides the shell', () => {
    const dir = dirWith('BOOTSTRAP_ADMIN_EMAIL=a@b.c\nBOOTSTRAP_ADMIN_PASSWORD=from-file\nFHIR_BASE_URL=http://hapi:8080/fhir\n');
    const env: NodeJS.ProcessEnv = { BOOTSTRAP_ADMIN_PASSWORD: 'from-shell' };
    expect(loadSeedEnv(dir, env)).toEqual(['BOOTSTRAP_ADMIN_EMAIL']);
    expect(env).toEqual({ BOOTSTRAP_ADMIN_EMAIL: 'a@b.c', BOOTSTRAP_ADMIN_PASSWORD: 'from-shell' });
  });

  it('treats a missing file as nothing to load', () => {
    expect(loadSeedEnv(join(tmpdir(), 'no-such-dir-seed-env'), {})).toEqual([]);
  });
});
