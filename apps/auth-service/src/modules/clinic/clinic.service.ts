import { Inject, Injectable } from '@nestjs/common';

import type { AuditActor } from '../audit/audit-event.builder';
import { AuditService } from '../audit/audit.service';
import { CLINIC_FIELDS, CLINIC_STORE, type ClinicDetails, type ClinicStore } from './clinic.store';
import type { UpdateClinicDto } from './dto/update-clinic.dto';

@Injectable()
export class ClinicService {
  constructor(
    @Inject(CLINIC_STORE) private readonly store: ClinicStore,
    private readonly audit: AuditService,
  ) {}

  get(): Promise<ClinicDetails> {
    return this.store.get();
  }

  async update(dto: UpdateClinicDto, actor: AuditActor): Promise<ClinicDetails> {
    const changedFields = CLINIC_FIELDS.filter((field) => dto[field] !== undefined);
    const updated = await this.store.update(dto);
    if (changedFields.length > 0) {
      await this.audit.recordClinicChange({ actor, changedFields });
    }
    return updated;
  }
}
