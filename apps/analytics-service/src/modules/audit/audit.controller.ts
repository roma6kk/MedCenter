import { Controller, Get, Query } from '@nestjs/common';
import { RequiresRoles, RequiresScopes } from '@medcenter/common';
import { Role, SMART_SCOPES, type PaginatedResponseDto } from '@medcenter/contracts';

import { AuditService } from './audit.service';
import type { AuditEventDto } from './dto/audit-event.dto';
import { AuditQueryDto } from './dto/audit-query.dto';

/** API §9.4 (FR-021, ADR-014) — the audit journal, administrators only (BR-007). */
@Controller('api/v1/admin/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @RequiresRoles(Role.ADMIN)
  list(@Query() query: AuditQueryDto): Promise<PaginatedResponseDto<AuditEventDto>> {
    return this.auditService.list(query);
  }
}
