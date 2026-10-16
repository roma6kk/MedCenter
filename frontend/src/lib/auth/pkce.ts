/**
 * pkce — RFC 7636 verifier / S256 challenge generation for the token broker.
 *
 * Runs in the Node runtime of the route handlers; uses only Web Crypto so it is
 * also testable under Jest.
 */

const VERIFIER_BYTES = 32;
const STATE_BYTES = 16;

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(byteLength: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest: ArrayBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier: string = randomToken(VERIFIER_BYTES);
  return { verifier, challenge: await challengeFor(verifier) };
}

export function createState(): string {
  return randomToken(STATE_BYTES);
}
