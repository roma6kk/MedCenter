import { isIP } from 'node:net';

/** The value Express's `trust proxy` setting accepts. */
export type TrustProxySetting = boolean | number | string;

const TRUST_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/**
 * Parses `TRUST_PROXY` into the value Express expects.
 *
 * - unset or empty, or `false`: trust no proxy (default; `X-Forwarded-For` is ignored)
 * - `true`: trust every hop (the left-most `X-Forwarded-For` entry is the client)
 * - a non-negative integer: the number of proxy hops in front of the service (e.g. `1` behind Traefik)
 * - a comma-separated list of IPs, CIDR ranges or `loopback`/`linklocal`/`uniquelocal`
 *
 * Throws on anything else so a misconfigured deployment fails at boot.
 */
export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = raw?.trim() ?? '';
  if (value === '' || value === 'false') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const entries = value.split(',').map((entry) => entry.trim());
  const invalid = entries.find((entry) => !isValidTrustEntry(entry));
  if (invalid !== undefined) {
    throw new Error(`TRUST_PROXY contains an invalid entry: "${invalid}"`);
  }
  return entries.join(',');
}

function isValidTrustEntry(entry: string): boolean {
  if (TRUST_KEYWORDS.has(entry)) {
    return true;
  }
  const [address, prefix, ...rest] = entry.split('/');
  if (address === undefined || rest.length > 0) {
    return false;
  }
  const version = isIP(address);
  if (version === 0) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  return /^\d+$/.test(prefix) && Number(prefix) <= (version === 4 ? 32 : 128);
}
