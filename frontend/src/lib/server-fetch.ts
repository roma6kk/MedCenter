// Hard timeout: during `next build` the API may be unreachable and an unbounded fetch would block static generation.

import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locale';

export const API_BASE: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8081';

const PUBLIC_FETCH_TIMEOUT_MS = 5000;
const PUBLIC_REVALIDATE_SECONDS = 300;

export type FetchResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly status?: number };

function isEmptyList(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data !== 'object' || data === null || !('items' in data)) return false;
  return Array.isArray(data.items) && data.items.length === 0;
}

// Accept-Language also keeps the languages apart in Next's data cache, which is keyed by URL and request headers.
async function request(
  path: string,
  locale: Locale,
  cache: RequestInit & { readonly next?: { readonly revalidate: number } },
): Promise<FetchResult<unknown>> {
  const res: Response = await fetch(`${API_BASE}${path}`, {
    ...cache,
    headers: { 'Accept-Language': locale },
    signal: AbortSignal.timeout(PUBLIC_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: await res.json() };
}

// An empty list must not sit in the 5-minute cache: it is asked again past the cache so freshly seeded data shows at once.
export async function publicApiFetch<T>(path: string, locale: Locale = DEFAULT_LOCALE): Promise<FetchResult<T>> {
  try {
    const cached: FetchResult<unknown> = await request(path, locale, { next: { revalidate: PUBLIC_REVALIDATE_SECONDS } });
    if (!cached.ok || !isEmptyList(cached.data)) return cached as FetchResult<T>;
    return (await request(path, locale, { cache: 'no-store' })) as FetchResult<T>;
  } catch {
    return { ok: false };
  }
}
