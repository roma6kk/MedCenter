import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS: string = readFileSync(join(__dirname, 'globals.css'), 'utf8');

type Theme = 'light' | 'dark';

/** The declarations of one theme: `:root { … }` for light, `:root[data-theme='dark'] { … }` for dark. */
function themeBlock(theme: Theme): string {
  const selector: string = theme === 'light' ? ':root {' : ":root[data-theme='dark'] {";
  const start: number = CSS.indexOf(selector);
  if (start === -1) throw new Error(`the ${theme} token block is missing from globals.css`);
  return CSS.slice(start, CSS.indexOf('}', start));
}

function token(name: string, theme: Theme = 'light'): string {
  const match: RegExpMatchArray | null = themeBlock(theme).match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (match === null || match[1] === undefined) throw new Error(`token --${name} is not a #rrggbb colour in the ${theme} block of globals.css`);
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

const THEMES: ReadonlyArray<Theme> = ['light', 'dark'];

describe.each(THEMES)('globals.css tokens (%s theme)', (theme) => {
  it.each(['card', 'background', 'secondary'])('should draw the border of a field at least 3:1 against --%s when WCAG 1.4.11 applies', (surface) => {
    expect(contrast(token('input', theme), token(surface, theme))).toBeGreaterThanOrEqual(3);
  });

  it('should keep the hairline --border softer than --input when cards and dividers use it', () => {
    expect(contrast(token('border', theme), token('card', theme))).toBeLessThan(contrast(token('input', theme), token('card', theme)));
  });

  it.each([
    ['foreground', 'background'],
    ['foreground', 'card'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['muted-foreground', 'secondary'],
    ['primary-foreground', 'primary'],
    ['primary', 'card'],
    ['primary-soft-foreground', 'primary-soft'],
    ['destructive', 'card'],
    ['destructive', 'destructive-soft'],
    ['warning', 'warning-soft'],
    ['success', 'success-soft'],
    ['inverse-foreground', 'inverse'],
    ['inverse-muted', 'inverse'],
    ['inverse-accent', 'inverse'],
  ])('should keep the text colour --%s at least 4.5:1 on --%s when WCAG 1.4.3 applies', (text, surface) => {
    expect(contrast(token(text, theme), token(surface, theme))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('globals.css theme blocks', () => {
  it('should override only tokens that exist in the light block when the dark theme is declared', () => {
    const names = (block: string): ReadonlyArray<string> => [...block.matchAll(/--([a-z-]+):/g)].map((match) => match[1] ?? '');
    const light = new Set(names(themeBlock('light')));

    expect(names(themeBlock('dark')).filter((name) => !light.has(name))).toEqual([]);
  });
});
