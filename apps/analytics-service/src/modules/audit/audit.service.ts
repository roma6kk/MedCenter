import { Inject, Injectable } from '@nestjs/common';
import {
  buildPaginatedResponse,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  type PaginatedResponseDto,
} from '@medcenter/contracts';

import { CLOCK, type Clock } from '../shared/clock';
import { resolveDateRange } from '../shared/date-range';
import { AUDIT_REPOSITORY, type AuditEventRow, type AuditRepository } from './audit.repository';
import type { AuditEventDto } from './dto/audit-event.dto';

/** Same shape as `AuditQueryDto`, decoupled from the HTTP layer. */
export interface AuditQuery {
  readonly from?: string;
  readonly to?: string;
  readonly entity?: string;
  readonly userId?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

function toDto(row: AuditEventRow): AuditEventDto {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    userId: row.userId ?? '',
    action: row.action,
    resourceType: row.resourceType ?? '',
    resourceId: row.resourceId ?? '',
    requestId: row.requestId ?? '',
    ...(row.reason === null ? {} : { reason: row.reason }),
  };
}

function entityFilter(entity: string | undefined): { resourceType?: string; resourceId?: string } {
  if (entity === undefined) {
    return {};
  }
  const [resourceType, resourceId] = entity.split('/');
  return { resourceType, resourceId };
}

/** API §9.4 (FR-021, ADR-014): the audit journal, newest first, from the read-model. */
@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(query: AuditQuery): Promise<PaginatedResponseDto<AuditEventDto>> {
    const range = resolveDateRange({ from: query.from, to: query.to }, this.clock());
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { rows, total } = await this.repository.findPage(
      { range, userId: query.userId, ...entityFilter(query.entity) },
      { offset: (page - 1) * pageSize, limit: pageSize },
    );
    return buildPaginatedResponse(rows.map(toDto), {
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize),
    });
  }
}
