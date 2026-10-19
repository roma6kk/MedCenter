/** The release bundled with the service (api-designer-spec §2.3.4); the import form starts with it. */
export const DEFAULT_SNAPSHOT_VERSION = '1.4.463';

/** The server's own rule: a release number of one to four dot-separated numbers, at most 32 characters. */
export const SNAPSHOT_VERSION_PATTERN = /^\d+(\.\d+){0,3}$/;
export const SNAPSHOT_VERSION_MAX = 32;

export function isSnapshotVersion(value: string): boolean {
  return value.length <= SNAPSHOT_VERSION_MAX && SNAPSHOT_VERSION_PATTERN.test(value);
}
