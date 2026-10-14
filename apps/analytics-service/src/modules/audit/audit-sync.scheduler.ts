import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';

import { AUDIT_SYNC_CONFIG, type AuditSyncConfig } from '../../config/analytics-env';
import { AuditSyncService } from './audit-sync.service';

/**
 * Pulls new `AuditEvent`s from HAPI into the journal read-model on a fixed
 * interval (architect §5: the worker fills the read-model "по расписанию").
 * Runs never overlap; a failed run is logged and the next tick retries. Every
 * replica may run it: rows are inserted-or-ignored and the cursor only moves
 * forward, so concurrent pulls are harmless.
 */
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
    void this.tick();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.sync.syncOnce();
    } catch (error) {
      this.logger.warn({ err: error }, 'audit journal sync failed; the next tick retries');
    } finally {
      this.running = false;
    }
  }
}
