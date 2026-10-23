import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, GUARD_PROBLEM_STATUSES, RequiresRoles, RequiresScopes, type RequestWithClaims } from '@medcenter/common';
import { DEFAULT_PAGE_SIZE, MAX_PAGE, MAX_PAGE_SIZE, Role, SMART_SCOPES, type PaginatedResponseDto } from '@medcenter/contracts';

import { MarkAllReadDoc, NotificationPageDoc, UnreadCountDoc } from './dto/notification-response.doc';
import type { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';
import { FhirIdPipe, patientReferenceOf } from './patient-reference';

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
@ApiTags('notification')
@ApiBearerAuth()
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: '8.1 List my in-app notifications' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number, 1..1000', schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE, default: 1 } })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Page size, 1..100', schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE } })
  @ApiQuery({ name: 'unread', required: false, description: 'Only unread notifications when `true`', schema: { type: 'string', enum: ['true', 'false'] } })
  @ApiResponse({ status: 200, description: 'Page of the caller\'s notifications', type: NotificationPageDoc })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES])
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  async list(
    @Req() request: RequestWithClaims,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('unread') unread?: string,
  ): Promise<PaginatedResponseDto<NotificationResponseDto>> {
    const patientRef = patientReferenceOf(request);
    return this.notifications.list(patientRef, {
      page: parsePositiveInt(page, 1, MAX_PAGE, 'page'),
      pageSize: parsePositiveInt(pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, 'pageSize'),
      unreadOnly: unread === 'true',
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: '8.2 Count my unread notifications' })
  @ApiResponse({ status: 200, description: 'Unread counter (polled by the UI)', type: UnreadCountDoc })
  @ApiProblems(GUARD_PROBLEM_STATUSES)
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_READ)
  async unreadCount(@Req() request: RequestWithClaims): Promise<{ count: number }> {
    const patientRef = patientReferenceOf(request);
    return { count: await this.notifications.unreadCount(patientRef) };
  }

  /** API §8.4: every unread notification of the caller becomes read; answers how many did. Declared before `:id/read`. */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '8.4 Mark all my unread notifications as read' })
  @ApiResponse({ status: 200, description: 'Number of notifications marked as read (up to 200 per call)', type: MarkAllReadDoc })
  @ApiProblems(GUARD_PROBLEM_STATUSES)
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_WRITE)
  async markAllRead(@Req() request: RequestWithClaims): Promise<{ updated: number }> {
    const patientRef = patientReferenceOf(request);
    return { updated: await this.notifications.markAllRead(patientRef) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '8.3 Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification (Communication) id' })
  @ApiResponse({ status: 204, description: 'Marked as read' })
  @ApiProblems([400, ...GUARD_PROBLEM_STATUSES, 404], { 404: 'NOT_FOUND: no such notification of the caller' })
  @RequiresRoles(Role.PATIENT)
  @RequiresScopes(SMART_SCOPES.PATIENT_WRITE)
  async markRead(@Req() request: RequestWithClaims, @Param('id', FhirIdPipe) id: string): Promise<void> {
    const patientRef = patientReferenceOf(request);
    await this.notifications.markRead(patientRef, id);
  }
}
