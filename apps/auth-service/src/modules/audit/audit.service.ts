import { Inject, Injectable, Logger } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import { buildUserAuditEvent, type UserAuditParams } from './audit-event.builder';
import { buildAuthAuditEvent, type AuthAuditParams } from './auth-event.builder';
import { buildClinicAuditEvent, type ClinicAuditParams } from './clinic-audit.builder';
import { buildTerminologyImportAuditEvent, type TerminologyImportAuditParams } from './terminology-import-audit.builder';

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

  /** Never rethrown: the audit must not fail or slow a sign-in; callers do not await it. */
  async recordAuthEvent(params: AuthAuditParams): Promise<void> {
    try {
      await this.fhir.create('AuditEvent', buildAuthAuditEvent(params));
    } catch (error: unknown) {
      this.logger.error(
        { err: error, kind: params.kind, userId: params.userId, requestId: params.requestId },
        'AuditEvent of the authentication event was not written',
      );
    }
  }

  async recordClinicChange(params: ClinicAuditParams): Promise<void> {
    try {
      await this.fhir.create('AuditEvent', buildClinicAuditEvent(params));
    } catch (error: unknown) {
      this.logger.error(
        { err: error, fields: params.changedFields, requestId: params.actor.requestId },
        'AuditEvent was not written; the committed clinic settings change stands',
      );
    }
  }

  /** Never rethrown: the audit must not fail an import. */
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
