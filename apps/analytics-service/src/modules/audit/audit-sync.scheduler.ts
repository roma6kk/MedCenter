import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';

import { AUDIT_SYNC_CONFIG, type AuditSyncConfig } from '../../config/analytics-env';
import { AuditSyncService } from './audit-sync.service';

// First-run retries: Compose starts the service as soon as HAPI exists (no healthcheck), so HAPI may boot for tens of seconds. Bounded.
export const STARTUP_RETRY_DELAYS_MS: ReadonlyArray<number> = [1_000, 2_000, 4_000, 8_000, 16_000];

// Runs never overlap. Safe on every replica: rows are insert-or-ignore and the cursor only moves forward.
@Injectable()
export class AuditSyncScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AuditSyncScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly sync: AuditSyncService,
    @Inject(AUDIT_SYNC_CONFIG) private readonly config: AuditSyncConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) {
      this.logger.log('audit journal sync is disabled (AUDIT_SYNC_ENABLED=false)');
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.config.intervalMs);
    this.timer.unref();
    void this.tick(true);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(startup = false): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await (startup ? this.syncWithStartupRetries() : this.sync.syncOnce());
    } catch (error) {
      this.logger.warn({ err: error }, 'audit journal sync failed; the next tick retries');
    } finally {
      this.running = false;
    }
  }

  private async syncWithStartupRetries(): Promise<void> {
    for (const delayMs of STARTUP_RETRY_DELAYS_MS) {
      try {
        await this.sync.syncOnce();
        return;
      } catch (error) {
        this.logger.log(`HAPI is not ready yet (${error instanceof Error ? error.message : 'error'}); retrying in ${delayMs} ms`);
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        if (this.timer === undefined) {
          return; // module destroyed while waiting
        }
      }
    }
    await this.sync.syncOnce();
  }
}
