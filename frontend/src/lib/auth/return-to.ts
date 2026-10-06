/**
 * sanitizeReturnTo — denylist guard for post-login redirects (ADR-009, NFR-006).
 *
 * The SMART callback redirects to a caller-supplied `returnTo`. Without a
 * denylist this is an open-redirect (token-bearing response → attacker host).
 * Only same-origin absolute paths are allowed; everything else falls back.
 */

const FALLBACK = '/booking';

const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function sanitizeReturnTo(raw: string | null | undefined, fallback: string = FALLBACK): string {
  if (raw === null || raw === undefined) return fallback;
  const trimmed: string = raw.trim();
  if (trimmed.length === 0) return fallback;

  let decoded: string = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return fallback;
  }

  // MUST start with a single leading slash (same-origin absolute path).
  if (!decoded.startsWith('/')) return fallback;
  // Denylist: protocol-relative, backslash escape, embedded scheme/host.
  if (decoded.startsWith('//')) return fallback;
  if (decoded.includes('\\')) return fallback;
  if (decoded.includes('://')) return fallback;
  if (SCHEME_PATTERN.test(decoded.replace(/^\/+/, ''))) return fallback;
  if (SCHEME_PATTERN.test(decoded)) return fallback;
  const lower: string = decoded.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return fallback;
  }
  // Control chars / header-splitting / angle brackets break out of redirects.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F<>"'\s]/.test(decoded.split('?')[0].split('#')[0])) return fallback;
  if (decoded.includes('\n') || decoded.includes('\r') || decoded.includes('\0')) return fallback;

  return decoded;
}

export function parsePkceCookie(raw: string | null | undefined): { verifier: string; state: string } | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record: Record<string, unknown> = parsed as Record<string, unknown>;
    if (typeof record['verifier'] !== 'string' || typeof record['state'] !== 'string') return null;
    if ((record['verifier'] as string).length === 0 || (record['state'] as string).length === 0) return null;
    return { verifier: record['verifier'] as string, state: record['state'] as string };
  } catch {
    return null;
  }
}
