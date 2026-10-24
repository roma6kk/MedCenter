import { parseRelayConfig } from './relay.config';

describe('parseRelayConfig', () => {
  it('should use the defaults when no variable is set', () => {
    expect(parseRelayConfig({})).toMatchObject({ pollIntervalMs: 2000, batchSize: 50, retentionMs: 7 * 24 * 60 * 60 * 1000, stalePendingMs: 300_000 });
  });

  it('should read overrides from the environment', () => {
    expect(parseRelayConfig({ OUTBOX_BATCH_SIZE: '10', OUTBOX_RETENTION_DAYS: '1' })).toMatchObject({ batchSize: 10, retentionMs: 86_400_000 });
  });

  it('should let OUTBOX_RETENTION_MS override the days and read the stale threshold', () => {
    expect(parseRelayConfig({ OUTBOX_RETENTION_DAYS: '2', OUTBOX_RETENTION_MS: '60000', OUTBOX_STALE_PENDING_MS: '15000' })).toMatchObject({
      retentionMs: 60_000,
      stalePendingMs: 15_000,
    });
  });

  it('should fail at startup when a value is not a positive integer', () => {
    expect(() => parseRelayConfig({ OUTBOX_BATCH_SIZE: '0' })).toThrow('OUTBOX_BATCH_SIZE');
    expect(() => parseRelayConfig({ OUTBOX_POLL_INTERVAL_MS: 'abc' })).toThrow('OUTBOX_POLL_INTERVAL_MS');
  });
});
