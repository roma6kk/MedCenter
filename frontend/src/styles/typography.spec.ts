import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS: string = readFileSync(join(__dirname, 'globals.css'), 'utf8');

/** The declaration block of the first rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const start: number = CSS.indexOf(`${selector} {`);
  if (start === -1) return '';
  return CSS.slice(start, CSS.indexOf('}', start));
}

describe('typography rules (VC2-VC4)', () => {
  it('should write a field label in normal case at 14 px and semibold when it is a .form-label', () => {
    const label: string = rule('.form-label');

    expect(label).not.toMatch(/text-transform/);
    expect(label).not.toMatch(/letter-spacing/);
    expect(label).toContain('font-size: var(--step--1)');
    expect(label).toContain('font-weight: 600');
  });

  it('should balance the lines of every heading when h1 to h3 wrap', () => {
    expect(rule('h1, h2, h3, .serif')).toContain('text-wrap: balance');
  });

  it('should keep the monospace face for codes only when .mono is defined', () => {
    expect(rule('.mono')).toContain('font-family: var(--font-mono)');
  });
});
