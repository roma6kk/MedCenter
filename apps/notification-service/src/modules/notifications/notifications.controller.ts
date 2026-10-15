import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { RequiresRoles, RequiresScopes, type RequestWithClaims } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';

import type { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';
import { FhirIdPipe, patientReferenceOf } from './patient-reference';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

function parsePositiveInt(raw: string | undefined, fallback: number, max: number, name: string): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new BadRequestException({ errorCode: 'VALIDATION_ERROR', message: `${name} must be an integer 1..${max}` });
  }
  return value;
}

/** API §8.1–8.3 — the patient's own in-app notifications (FR-008). */
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  async list(
    @Req() request: RequestWithClaims,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('unread') unread?: string,
  ): Promise<NotificationResponseDto[]> {
    const patientRef = patientReferenceOf(request);
    return this.notifications.list(patientRef, {
      page: parsePositiveInt(page, 1, Number.MAX_SAFE_INTEGER, 'page'),
      pageSize: parsePositiveInt(pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, 'pageSize'),
      unreadOnly: unread === 'true',
    });
  }

  @Get('unread-count')
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  async unreadCount(@Req() request: RequestWithClaims): Promise<{ count: number }> {
    const patientRef = patientReferenceOf(request);
    return { count: await this.notifications.unreadCount(patientRef) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_WRITE)
  async markRead(@Req() request: RequestWithClaims, @Param('id', FhirIdPipe) id: string): Promise<void> {
    const patientRef = patientReferenceOf(request);
    await this.notifications.markRead(patientRef, id);
  }
}
