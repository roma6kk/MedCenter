import { Module } from '@nestjs/common';

import { AUDIT_SYNC_CONFIG, parseAuditSyncEnv, type AuditSyncConfig } from '../../config/analytics-env';
import { CLOCK, systemClock } from '../shared/clock';
import { FhirModule } from '../shared/fhir.module';
import { AuditSyncScheduler } from './audit-sync.scheduler';
import { AuditSyncService } from './audit-sync.service';
import { AuditController } from './audit.controller';
import { AUDIT_REPOSITORY, TypeOrmAuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Module({
  imports: [FhirModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditSyncService,
    AuditSyncScheduler,
    { provide: AUDIT_REPOSITORY, useClass: TypeOrmAuditRepository },
    { provide: AUDIT_SYNC_CONFIG, useFactory: (): AuditSyncConfig => parseAuditSyncEnv(process.env) },
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class AuditModule {}
