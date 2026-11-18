const SINGLE_VERSION = /^(?:W\/)?(?:"([A-Za-z0-9\-.]{1,64})"|([A-Za-z0-9\-.]{1,64}))$/;

export function versionFromIfMatch(header: string | undefined): string | null {
  const match = SINGLE_VERSION.exec(header?.trim() ?? '');
  return match?.[1] ?? match?.[2] ?? null;
}
