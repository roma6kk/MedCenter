// Open-redirect guard: only same-origin absolute paths pass, everything else falls back.

const FALLBACK = '/booking';

const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function isUnsafePath(decoded: string): boolean {
  if (!decoded.startsWith('/')) return true;
  if (decoded.startsWith('//') || decoded.includes('\\') || decoded.includes('://')) return true;
  if (SCHEME_PATTERN.test(decoded.replace(/^\/+/, '')) || SCHEME_PATTERN.test(decoded)) return true;
  const lower = decoded.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return true;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F<>"'\s]/.test(decoded.split('?')[0].split('#')[0])) return true;
  return decoded.includes('\n') || decoded.includes('\r') || decoded.includes('\0');
}

export function sanitizeReturnTo(raw: unknown, fallback: string = FALLBACK): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return fallback;

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return fallback;
  }
  return isUnsafePath(decoded) ? fallback : decoded;
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
