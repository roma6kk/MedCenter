import { createHmac, timingSafeEqual } from 'node:crypto';

function mac(body: string, key: Buffer): Buffer {
  return createHmac('sha256', key).update(body).digest();
}

/**
 * `<base64url(JSON)>.<base64url(HMAC-SHA256)>` — a compact, tamper-evident
 * value for the authorization server's own cookies. It is signed, not
 * encrypted: the payload carries only ids and timestamps.
 */
export function signValue(payload: Readonly<Record<string, unknown>>, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body, key).toString('base64url')}`;
}

/** The decoded payload, or `null` for a malformed value or a bad signature (checked in constant time). */
export function verifySignedValue(value: string, key: Buffer): unknown {
  const parts = value.split('.');
  const [body, signature] = parts;
  if (parts.length !== 2 || body === undefined || signature === undefined || body.length === 0) {
    return null;
  }
  const expected = mac(body, key);
  const presented = Buffer.from(signature, 'base64url');
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
  } catch {
    // A valid MAC over non-JSON can only come from our own key; treat it as absent.
    return null;
  }
}
