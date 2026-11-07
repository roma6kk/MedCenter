export const DEFAULT_SNAPSHOT_VERSION = '1.4.463';

export const SNAPSHOT_VERSION_PATTERN = /^\d+(\.\d+){0,3}$/;
export const SNAPSHOT_VERSION_MAX = 32;

export function isSnapshotVersion(value: string): boolean {
  return value.length <= SNAPSHOT_VERSION_MAX && SNAPSHOT_VERSION_PATTERN.test(value);
}
