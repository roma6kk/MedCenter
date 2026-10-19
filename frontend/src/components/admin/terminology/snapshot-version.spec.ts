import { DEFAULT_SNAPSHOT_VERSION, isSnapshotVersion } from './snapshot-version';

describe('isSnapshotVersion', () => {
  it.each(['1', '1.4', '1.4.463', '1.4.463.7'])('should accept the release number %s when the version is checked', (value) => {
    expect(isSnapshotVersion(value)).toBe(true);
  });

  it.each(['', 'v1.4', '1.4.', '.1', '1..4', '1.4.463.7.9', '1.4.x', ' 1.4', `1.${'2'.repeat(40)}`])('should refuse %j', (value) => {
    expect(isSnapshotVersion(value)).toBe(false);
  });

  it('should start from the bundled release when the form is empty', () => {
    expect(isSnapshotVersion(DEFAULT_SNAPSHOT_VERSION)).toBe(true);
  });
});
