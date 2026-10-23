const SINGLE_VERSION = /^(?:W\/)?(?:"([A-Za-z0-9\-.]{1,64})"|([A-Za-z0-9\-.]{1,64}))$/;

/**
 * The `meta.versionId` an `If-Match` header names (`W/"3"`, `"3"` or `3`), or
 * `null` when it is absent, `*` or not a single version (ADR-012).
 */
export function versionFromIfMatch(header: string | undefined): string | null {
  const match = SINGLE_VERSION.exec(header?.trim() ?? '');
  return match?.[1] ?? match?.[2] ?? null;
}
