import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS: string = readFileSync(join(__dirname, 'globals.css'), 'utf8');

function token(name: string): string {
  const match: RegExpMatchArray | null = CSS.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (match === null || match[1] === undefined) throw new Error(`token --${name} is not a #rrggbb colour in globals.css`);
  return match[1];
}

function channel(hex: string, from: number): number {
  const value: number = Number.parseInt(hex.slice(from, from + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe('globals.css tokens', () => {
  it.each(['card', 'background', 'secondary'])('should draw the border of a field at least 3:1 against --%s when WCAG 1.4.11 applies', (surface) => {
    expect(contrast(token('input'), token(surface))).toBeGreaterThanOrEqual(3);
  });

  it('should keep the hairline --border lighter than --input when cards and dividers use it', () => {
    expect(contrast(token('border'), token('card'))).toBeLessThan(contrast(token('input'), token('card')));
  });

  it.each([
    ['foreground', 'background'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['primary-foreground', 'primary'],
  ])('should keep the text colour --%s at least 4.5:1 on --%s when WCAG 1.4.3 applies', (text, surface) => {
    expect(contrast(token(text), token(surface))).toBeGreaterThanOrEqual(4.5);
  });
});
