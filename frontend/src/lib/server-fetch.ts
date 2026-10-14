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

export type FetchResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false };

export async function publicApiFetch<T>(path: string): Promise<FetchResult<T>> {
  try {
    const res: Response = await fetch(`${API_BASE}${path}`, {
      next: { revalidate: PUBLIC_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(PUBLIC_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false };
  }
}
