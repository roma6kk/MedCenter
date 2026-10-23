import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, auditActorOf, GUARD_PROBLEM_STATUSES, RequiresRoles, RequiresScopes, type AuditedRequest } from '@medcenter/common';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, Role, SMART_SCOPES } from '@medcenter/contracts';

import { PageQueryDto } from '../../common/page-query.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { RoomIdParamDto } from './dto/room-id-param.dto';
import { RoomPageDoc, RoomResponseDoc, RoomUsageResponseDoc } from './dto/room-response.doc';
import type { RoomResponseDto } from './dto/room-response.dto';
import type { RoomUsageResponseDto } from './dto/room-usage-response.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomUsageService } from './room-usage.service';
import { RoomsService, type RoomPage } from './rooms.service';

/** API §4.3–4.7. Read routes need `user/*.read`; admin routes carry `ADMIN` (BR-007). */
@ApiTags('practitioner')
@ApiBearerAuth()
@Controller('api/v1')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomUsage: RoomUsageService,
  ) {}

  @Get('rooms')
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @ApiOperation({ summary: '4.3 List the rooms' })
  @ApiResponse({ status: HttpStatus.OK, type: RoomPageDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400])
  async list(@Query() query: PageQueryDto): Promise<RoomPage> {
    return this.roomsService.list(query.page ?? DEFAULT_PAGE, query.pageSize ?? DEFAULT_PAGE_SIZE);
  }

  @Post('admin/rooms')
  @RequiresRoles(Role.ADMIN)
  @ApiOperation({ summary: '4.4 Create a room' })
  @ApiResponse({ status: HttpStatus.CREATED, type: RoomResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 409], { 409: 'CONFLICT: the room identifier is already used by another room' })
  async create(@Req() request: AuditedRequest, @Body() dto: CreateRoomDto): Promise<RoomResponseDto> {
    return this.roomsService.create(dto, auditActorOf(request));
  }

  @Patch('admin/rooms/:id')
  @RequiresRoles(Role.ADMIN)
  @ApiOperation({ summary: '4.5 Update a room' })
  @ApiResponse({ status: HttpStatus.OK, type: RoomResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], { 409: 'CONFLICT: the room identifier is already used by another room' })
  async update(
    @Req() request: AuditedRequest,
    @Param() params: RoomIdParamDto,
    @Body() dto: UpdateRoomDto,
  ): Promise<RoomResponseDto> {
    return this.roomsService.update(params.id, dto, auditActorOf(request));
  }

  /**
   * API §4.7 — schedules and upcoming bookings that use the room; `inUse`
   * mirrors the `ROOM_IN_USE` rule of §4.6. Read-only, hence `user/*.read`.
   */
  @Get('admin/rooms/:id/usage')
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  @ApiOperation({ summary: '4.7 Get the usage of a room by schedules and upcoming bookings' })
  @ApiResponse({ status: HttpStatus.OK, type: RoomUsageResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404])
  async usage(@Param() params: RoomIdParamDto): Promise<RoomUsageResponseDto> {
    return this.roomUsage.usage(params.id);
  }

  @Delete('admin/rooms/:id')
  @RequiresRoles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '4.6 Delete a room that no schedule uses' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Room deleted' })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], { 409: 'ROOM_IN_USE: an active Schedule references the room' })
  async remove(@Req() request: AuditedRequest, @Param() params: RoomIdParamDto): Promise<void> {
    await this.roomsService.remove(params.id, auditActorOf(request));
  }
}
