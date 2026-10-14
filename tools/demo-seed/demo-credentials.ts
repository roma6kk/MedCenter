import { randomBytes, randomInt } from 'node:crypto';

/**
 * Demo credentials are never written in source. A password comes from the
 * environment (`DEMO_*_PASSWORD`), else from the previous run's manifest, else
 * it is generated here — and then lands only in the git-ignored manifest.
 */

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+';
const POLICY_MIN_LENGTH = 10;
const GENERATED_LENGTH = 18;

type RandomIndex = (upperBound: number) => number;

function pick(alphabet: string, index: RandomIndex): string {
  return alphabet.charAt(index(alphabet.length));
}

/** Fisher-Yates over the characters, so the guaranteed classes do not sit in fixed positions. */
function shuffle(characters: string[], index: RandomIndex): string[] {
  const shuffled = [...characters];
  for (let position = shuffled.length - 1; position > 0; position -= 1) {
    const other = index(position + 1);
    const held = shuffled[position] ?? '';
    shuffled[position] = shuffled[other] ?? '';
    shuffled[other] = held;
  }
  return shuffled;
}

/**
 * A random password that satisfies the auth-service policy (`PASSWORD_POLICY`:
 * length >= 10 with a lower-case letter, an upper-case letter, a digit and a
 * symbol). Look-alike characters (`l`, `I`, `O`, `0`, `1`) are left out so a
 * human can copy the value from the manifest without guessing.
 */
export function generatePassword(index: RandomIndex = (bound) => randomInt(bound)): string {
  const required = [pick(LOWER, index), pick(UPPER, index), pick(DIGITS, index), pick(SYMBOLS, index)];
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const filler = Array.from({ length: Math.max(GENERATED_LENGTH, POLICY_MIN_LENGTH) - required.length }, () =>
    pick(all, index),
  );
  return shuffle([...required, ...filler], index).join('');
}

/** Opaque random token for correlating one login attempt (OAuth `state`). */
export function randomState(): string {
  return randomBytes(16).toString('base64url');
}

export interface PasswordSources {
  /** `DEMO_*_PASSWORD` from the environment. */
  readonly fromEnv?: string;
  /** Password recorded by a previous run for the same account. */
  readonly fromManifest?: string;
}

/** env > previous manifest > freshly generated. */
export function resolvePassword(sources: PasswordSources, generate: () => string = generatePassword): string {
  return sources.fromEnv ?? sources.fromManifest ?? generate();
}
