import type { AuditSyncConfig } from '../../config/analytics-env';
import { AuditSyncScheduler, STARTUP_RETRY_DELAYS_MS } from './audit-sync.scheduler';
import type { AuditSyncService } from './audit-sync.service';

const CONFIG: AuditSyncConfig = { enabled: true, intervalMs: 15_000 };

describe('AuditSyncScheduler', () => {
  let sync: jest.Mocked<Pick<AuditSyncService, 'syncOnce'>>;

  function start(config: AuditSyncConfig = CONFIG): AuditSyncScheduler {
    const scheduler = new AuditSyncScheduler(sync as unknown as AuditSyncService, config);
    scheduler.onApplicationBootstrap();
    return scheduler;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    sync = { syncOnce: jest.fn().mockResolvedValue({ fetched: 0, stored: 0 }) };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should sync once at startup and then on every interval when enabled', async () => {
    const scheduler = start();
    await jest.advanceTimersByTimeAsync(0);

    await jest.advanceTimersByTimeAsync(CONFIG.intervalMs * 2);

    expect(sync.syncOnce).toHaveBeenCalledTimes(3);
    scheduler.onModuleDestroy();
  });

  it('should never start when AUDIT_SYNC_ENABLED=false', async () => {
    start({ enabled: false, intervalMs: CONFIG.intervalMs });

    await jest.advanceTimersByTimeAsync(CONFIG.intervalMs * 3);

    expect(sync.syncOnce).not.toHaveBeenCalled();
  });

  it('should skip a tick when the previous run is still going, so runs never overlap', async () => {
    let finish: () => void = () => undefined;
    sync.syncOnce.mockImplementation(
      () => new Promise((resolve) => {
        finish = () => resolve({ fetched: 0, stored: 0 });
      }),
    );
    const scheduler = start();

    await jest.advanceTimersByTimeAsync(CONFIG.intervalMs * 3);
    finish();

    expect(sync.syncOnce).toHaveBeenCalledTimes(1);
    scheduler.onModuleDestroy();
  });

  it('should keep the schedule alive when a scheduled run fails', async () => {
    sync.syncOnce
      .mockResolvedValueOnce({ fetched: 0, stored: 0 })
      .mockRejectedValueOnce(new Error('HAPI down'));
    const scheduler = start();
    await jest.advanceTimersByTimeAsync(0);

    await jest.advanceTimersByTimeAsync(CONFIG.intervalMs * 2);

    expect(sync.syncOnce).toHaveBeenCalledTimes(3);
    scheduler.onModuleDestroy();
  });

  it('should retry the startup run with backoff while HAPI is not ready, before the first interval', async () => {
    sync.syncOnce
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const scheduler = start();

    await jest.advanceTimersByTimeAsync(0);
    expect(sync.syncOnce).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(STARTUP_RETRY_DELAYS_MS[0]);
    expect(sync.syncOnce).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(STARTUP_RETRY_DELAYS_MS[1]);

    expect(sync.syncOnce).toHaveBeenCalledTimes(3);
    expect(STARTUP_RETRY_DELAYS_MS[1]).toBeGreaterThan(STARTUP_RETRY_DELAYS_MS[0]);
    expect(STARTUP_RETRY_DELAYS_MS[0] + STARTUP_RETRY_DELAYS_MS[1]).toBeLessThan(CONFIG.intervalMs);
    scheduler.onModuleDestroy();
  });

  it('should stop retrying at startup after the bounded number of attempts', async () => {
    sync.syncOnce.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const scheduler = start({ enabled: true, intervalMs: 3_600_000 });

    await jest.advanceTimersByTimeAsync(STARTUP_RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0) * 2);

    expect(sync.syncOnce).toHaveBeenCalledTimes(STARTUP_RETRY_DELAYS_MS.length + 1);
    scheduler.onModuleDestroy();
  });

  it('should stop ticking when the module is destroyed', async () => {
    const scheduler = start();
    await jest.advanceTimersByTimeAsync(0);

    scheduler.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(CONFIG.intervalMs * 3);

    expect(sync.syncOnce).toHaveBeenCalledTimes(1);
  });
});
