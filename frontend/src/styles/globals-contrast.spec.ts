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

/** A colour as linear-light sRGB channels (0..1). */
type LinearRgb = readonly [number, number, number];

const OKLCH_PATTERN: RegExp = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/;

/**
 * OKLCH to linear sRGB, per Björn Ottosson's reference conversion (https://bottosson.github.io/posts/oklab/):
 * LCH to Lab (polar to cartesian), Lab to the cube-root LMS, cube it, then the LMS-to-linear-sRGB matrix.
 * Channels outside the gamut are clamped, the way a browser maps an out-of-gamut colour onto an sRGB screen.
 */
function oklchToLinearRgb(lightness: number, chroma: number, hue: number): LinearRgb {
  const a: number = chroma * Math.cos((hue * Math.PI) / 180);
  const b: number = chroma * Math.sin((hue * Math.PI) / 180);
  const l: number = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m: number = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s: number = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** A token's colour as linear-light sRGB and its opacity (1 when the token has no `/ alpha`). */
interface Paint {
  readonly rgb: LinearRgb;
  readonly alpha: number;
}

/** The value of `--name` in a theme block; only `oklch(L% C H)` or `oklch(L C H)` (L in 0..1), each with an optional `/ alpha`, is accepted. */
function paint(name: string, theme: Theme): Paint {
  const match: RegExpMatchArray | null = themeBlock(theme).match(new RegExp(`--${name}:\\s*([^;]+);`));
  const value: string | undefined = match?.[1]?.trim();
  const parts: RegExpMatchArray | null | undefined = value?.match(OKLCH_PATTERN);
  if (parts === null || parts === undefined) throw new Error(`token --${name} is not an oklch(L C H) colour in the ${theme} block of globals.css`);
  const lightness: number = parts[2] === '%' ? Number(parts[1]) / 100 : Number(parts[1]);
  return { rgb: oklchToLinearRgb(lightness, Number(parts[3]), Number(parts[4])), alpha: parts[5] === undefined ? 1 : Number(parts[5]) };
}

/** The value of `--name` in a theme block as linear-light sRGB; a translucent token is `paint`ed over something with `over` instead. */
function token(name: string, theme: Theme = 'light'): LinearRgb {
  const { rgb, alpha } = paint(name, theme);
  if (alpha !== 1) throw new Error(`token --${name} is translucent (${alpha}); lay it over a ground with over()`);
  return rgb;
}

/** WCAG 2.x relative luminance: the sRGB weights applied to linear-light channels. */
function luminance([red, green, blue]: LinearRgb): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG contrast ratio of two colours. */
function contrast(a: LinearRgb, b: LinearRgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** The sRGB transfer function of a linear-light channel: the gamma-encoded value a browser stores and blends. */
function encode(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function decode(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * `top` at the opacity `alpha` laid over the ground `under`, the way a browser composites sRGB colours: per channel, on the
 * gamma-encoded values (not in linear light). The blur of `backdrop-filter` only smears the ground, it does not change its mean.
 */
function over({ rgb: top, alpha }: Paint, under: LinearRgb): LinearRgb {
  const blend = (above: number, below: number): number => decode(alpha * encode(above) + (1 - alpha) * encode(below));
  return [blend(top[0], under[0]), blend(top[1], under[1]), blend(top[2], under[2])];
}

describe('oklch conversion', () => {
  it('should give the black/white contrast of 21:1 when the converter is fed oklch(0 0 0) and oklch(1 0 0)', () => {
    expect(contrast(oklchToLinearRgb(0, 0, 0), oklchToLinearRgb(1, 0, 0))).toBeCloseTo(21, 5);
  });

  it('should match the sRGB value of #0f766e when it is fed oklch(51.1% 0.086 186)', () => {
    // #0f766e: 0x0f/255 -> 0.0048 linear, 0x76/255 -> 0.1812, 0x6e/255 -> 0.1559 (rounded oklch, so a loose tolerance).
    const [red, green, blue] = oklchToLinearRgb(0.511, 0.086, 186);

    expect(red).toBeCloseTo(0.0048, 2);
    expect(green).toBeCloseTo(0.1812, 2);
    expect(blue).toBeCloseTo(0.1559, 2);
  });
});

describe('compositing', () => {
  it('should give the mid grey of the gamma-encoded blend when half-opaque white is laid over black', () => {
    // 0.5 in gamma-encoded sRGB is 0.2140 in linear light; a blend in linear light would give 0.5.
    const [red, green, blue] = over({ rgb: [1, 1, 1], alpha: 0.5 }, [0, 0, 0]);

    expect(red).toBeCloseTo(0.214, 3);
    expect(green).toBeCloseTo(0.214, 3);
    expect(blue).toBeCloseTo(0.214, 3);
  });

  it('should leave the ground untouched when the top colour is fully transparent', () => {
    expect(over({ rgb: [1, 1, 1], alpha: 0 }, [0.2, 0.4, 0.6])).toEqual([expect.closeTo(0.2, 6), expect.closeTo(0.4, 6), expect.closeTo(0.6, 6)]);
  });
});

const THEMES: ReadonlyArray<Theme> = ['light', 'dark'];

/**
 * What can scroll under a translucent sticky bar (`bg-glass` of the staff header and sidebar, the mobile booking bar): the
 * grounds and every saturated solid fill (a chart bar, a primary or a destructive button). The worst case sets the opacity.
 */
const GLASS_FILLS: ReadonlyArray<string> = ['background', 'card', 'secondary', 'primary', 'destructive', 'warm', 'info', 'success', 'warning'];
const GLASS_CASES: ReadonlyArray<[string, string]> = ['foreground', 'muted-foreground'].flatMap((text) => GLASS_FILLS.map((fill): [string, string] => [text, fill]));

describe.each(THEMES)('globals.css tokens (%s theme)', (theme) => {
  it.each(['card', 'background', 'secondary'])('should draw the border of a field at least 3:1 against --%s when WCAG 1.4.11 applies', (surface) => {
    expect(contrast(token('input', theme), token(surface, theme))).toBeGreaterThanOrEqual(3);
  });

  it('should keep the decorative --warm fill visible enough on a card when it marks a highlight (WCAG 1.4.11, 3:1)', () => {
    expect(contrast(token('warm', theme), token('card', theme))).toBeGreaterThanOrEqual(3);
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
    ['primary-foreground', 'primary-hover'],
    ['primary-foreground', 'primary-strong'],
    ['primary', 'card'],
    ['primary-soft-foreground', 'primary-soft'],
    ['primary-soft-foreground', 'primary-soft-hover'],
    ['destructive', 'card'],
    ['destructive', 'destructive-soft'],
    ['destructive', 'destructive-soft-hover'],
    ['destructive-foreground', 'destructive'],
    ['destructive-foreground', 'destructive-hover'],
    ['warning', 'warning-soft'],
    ['warning-foreground', 'warning'],
    ['success', 'success-soft'],
    ['success-foreground', 'success'],
    ['info', 'card'],
    ['info', 'info-soft'],
    ['warm-foreground', 'warm-soft'],
    ['inverse-foreground', 'inverse'],
    ['inverse-muted', 'inverse'],
    ['inverse-accent', 'inverse'],
  ])('should keep the text colour --%s at least 4.5:1 on --%s when WCAG 1.4.3 applies', (text, surface) => {
    expect(contrast(token(text, theme), token(surface, theme))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GLASS_CASES)('should keep the text colour --%s at least 4.5:1 on the glass panel over --%s when the page scrolls under it (WCAG 1.4.3)', (text, fill) => {
    expect(contrast(token(text, theme), over(paint('glass', theme), token(fill, theme)))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('globals.css theme blocks', () => {
  it('should override only tokens that exist in the light block when the dark theme is declared', () => {
    const names = (block: string): ReadonlyArray<string> => [...block.matchAll(/--([a-z0-9-]+):/g)].map((match) => match[1] ?? '');
    const light = new Set(names(themeBlock('light')));

    expect(names(themeBlock('dark')).filter((name) => !light.has(name))).toEqual([]);
  });
});
