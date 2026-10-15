import { Inject, Injectable, Logger } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import { buildUserAuditEvent, type UserAuditParams } from './audit-event.builder';
import { buildTerminologyImportAuditEvent, type TerminologyImportAuditParams } from './terminology-import-audit.builder';

/**
 * Writes the `AuditEvent` of every user mutation to HAPI (FR-021, ADR-014).
 *
 * The account change lives in PostgreSQL (`auth` schema) and is already
 * committed when the audit record is written, so the two cannot share a
 * transaction. A HAPI failure here is logged at `error` with the account and
 * event — never rethrown: rolling back a deactivation because the audit store
 * is down would keep a revoked user active, which is the worse outcome.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  async recordUserChange(params: UserAuditParams): Promise<void> {
    try {
      await this.fhir.create('AuditEvent', buildUserAuditEvent(params));
    } catch (error: unknown) {
      this.logger.error(
        { err: error, userId: params.userId, event: params.event, requestId: params.actor.requestId },
        'AuditEvent was not written; the committed user change stands',
      );
    }
  }

  /**
   * The `AuditEvent` of a terminology import (`started` when it is accepted,
   * `completed`/`failed` when the job ends). Never rethrown, for the same
   * reason: the import itself does not depend on its audit trail being writable.
   */
  async recordTerminologyImport(params: TerminologyImportAuditParams): Promise<void> {
    try {
      await this.fhir.create('AuditEvent', buildTerminologyImportAuditEvent(params));
    } catch (error: unknown) {
      this.logger.error(
        { err: error, importId: params.importId, stage: params.stage, requestId: params.actor.requestId },
        'AuditEvent of the terminology import was not written',
      );
    }
  }
}
