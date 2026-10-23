import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, GUARD_PROBLEM_STATUSES, RequiresRoles, RequiresScopes } from '@medcenter/common';
import { Role, SMART_SCOPES, type PaginatedResponseDto } from '@medcenter/contracts';

import { AuditService } from './audit.service';
import { AuditPageDoc } from './dto/audit-event.doc';
import type { AuditEventDto } from './dto/audit-event.dto';
import { AuditQueryDto } from './dto/audit-query.dto';

/** API §9.4 (FR-021, ADR-014) — the audit journal, administrators only (BR-007). */
@ApiTags('analytics')
@ApiBearerAuth()
@Controller('api/v1/admin/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: '9.4 Audit journal (AuditEvent read-model)' })
  @ApiResponse({ status: 200, description: 'Page of journal rows, newest first', type: AuditPageDoc })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES], { 400: 'VALIDATION_ERROR: malformed filter, from > to or range longer than 366 days' })
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @RequiresRoles(Role.ADMIN)
  list(@Query() query: AuditQueryDto): Promise<PaginatedResponseDto<AuditEventDto>> {
    return this.auditService.list(query);
  }
}
