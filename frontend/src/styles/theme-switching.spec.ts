import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS: string = readFileSync(join(__dirname, 'globals.css'), 'utf8');

describe('globals.css theme switching', () => {
  it('should turn every transition off, pseudo-elements included, while <html> carries data-theme-switching', () => {
    const start: number = CSS.indexOf(':root[data-theme-switching] *,');
    expect(start).toBeGreaterThan(-1);

    const rule: string = CSS.slice(start, CSS.indexOf('}', start));

    expect(rule).toContain(':root[data-theme-switching] *::before');
    expect(rule).toContain(':root[data-theme-switching] *::after');
    expect(rule).toMatch(/transition:\s*none\s*!important/);
  });
});
