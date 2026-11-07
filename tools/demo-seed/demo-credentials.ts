import { randomBytes, randomInt } from 'node:crypto';

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

export function generatePassword(index: RandomIndex = (bound) => randomInt(bound)): string {
  const required = [pick(LOWER, index), pick(UPPER, index), pick(DIGITS, index), pick(SYMBOLS, index)];
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const filler = Array.from({ length: Math.max(GENERATED_LENGTH, POLICY_MIN_LENGTH) - required.length }, () =>
    pick(all, index),
  );
  return shuffle([...required, ...filler], index).join('');
}

export function randomState(): string {
  return randomBytes(16).toString('base64url');
}

interface PasswordSources {
  readonly fromEnv?: string;
  readonly fromManifest?: string;
}

export function resolvePassword(sources: PasswordSources, generate: () => string = generatePassword): string {
  return sources.fromEnv ?? sources.fromManifest ?? generate();
}
