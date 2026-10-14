import type { AuditSyncConfig } from '../../config/analytics-env';
import { AuditSyncScheduler } from './audit-sync.scheduler';
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

  it('should keep the schedule alive when a run fails', async () => {
    sync.syncOnce.mockRejectedValueOnce(new Error('HAPI down'));
    const scheduler = start();
    await jest.advanceTimersByTimeAsync(0);

    await jest.advanceTimersByTimeAsync(CONFIG.intervalMs);

    expect(sync.syncOnce).toHaveBeenCalledTimes(2);
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
