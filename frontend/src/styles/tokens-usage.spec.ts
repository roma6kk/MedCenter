import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC: string = join(__dirname, '..');

function sources(dir: string = SRC): ReadonlyArray<readonly [string, string]> {
  return readdirSync(dir).flatMap((name): ReadonlyArray<readonly [string, string]> => {
    const path: string = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx?|css)$/.test(name) && !/\.spec\.tsx?$/.test(name) ? [[path.slice(SRC.length + 1), readFileSync(path, 'utf8')]] : [];
  });
}

function offenders(pattern: RegExp): ReadonlyArray<string> {
  return sources().filter(([, text]) => pattern.test(text)).map(([path]) => path);
}

describe('design token usage', () => {
  it('should use the fluid type scale and no arbitrary font size when a text size is set', () => {
    expect(offenders(/\btext-\[\d/)).toEqual([]);
  });

  it('should use the radius tokens and no arbitrary or default-scale radius when a corner is rounded', () => {
    expect(offenders(/\brounded-(\[|md\b|lg\b|xl\b|2xl\b|3xl\b)/)).toEqual([]);
  });

  it('should use the motion tokens and never transition all properties when a transition is set', () => {
    expect(offenders(/\btransition-all\b|transition:\s*all\b/)).toEqual([]);
  });
});
