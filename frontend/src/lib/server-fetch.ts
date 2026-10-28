/**
 * server-fetch — bounded fetch helper for public RSC pages.
 *
 * The public catalog pages render on the server and refresh on an ISR window.
 * A hard timeout is required: during `next build` the API may not be reachable,
 * and an unbounded fetch blocks static generation until the 60s build limit.
 * The timeout degrades gracefully to the page's error/empty state.
 */

export const API_BASE: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8081';

const PUBLIC_FETCH_TIMEOUT_MS = 5000;
const PUBLIC_REVALIDATE_SECONDS = 300;

/** `status` is the HTTP status of a refused call; it is absent when the API could not be reached at all. */
export type FetchResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly status?: number };

/** A list answer with nothing in it: `{ items: [] }` of the envelope, or a bare `[]`. */
function isEmptyList(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data !== 'object' || data === null || !('items' in data)) return false;
  return Array.isArray(data.items) && data.items.length === 0;
}

async function request(path: string, cache: RequestInit & { readonly next?: { readonly revalidate: number } }): Promise<FetchResult<unknown>> {
  const res: Response = await fetch(`${API_BASE}${path}`, { ...cache, signal: AbortSignal.timeout(PUBLIC_FETCH_TIMEOUT_MS) });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: await res.json() };
}

/**
 * An empty list must not stay in the revalidating cache for five minutes: right after the catalog is seeded (or an
 * administrator adds the first doctor) the page would keep saying "nothing here". The answer is read from the cache
 * first (cheap, the common case); when it is an empty list, it is asked for again past the cache, so new data shows at
 * once and the cache is only ever relied on for a catalog that has something in it.
 */
export async function publicApiFetch<T>(path: string): Promise<FetchResult<T>> {
  try {
    const cached: FetchResult<unknown> = await request(path, { next: { revalidate: PUBLIC_REVALIDATE_SECONDS } });
    if (!cached.ok || !isEmptyList(cached.data)) return cached as FetchResult<T>;
    return (await request(path, { cache: 'no-store' })) as FetchResult<T>;
  } catch {
    return { ok: false };
  }
}
