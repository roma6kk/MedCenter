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
} from '@nestjs/common';
import { RequiresRoles, RequiresScopes } from '@medcenter/common';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, Role, SMART_SCOPES } from '@medcenter/contracts';

import { PageQueryDto } from '../../common/page-query.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { RoomIdParamDto } from './dto/room-id-param.dto';
import type { RoomResponseDto } from './dto/room-response.dto';
import type { RoomUsageResponseDto } from './dto/room-usage-response.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomUsageService } from './room-usage.service';
import { RoomsService, type RoomPage } from './rooms.service';

/** API §4.3–4.7. Read routes need `user/*.read`; admin routes carry `ADMIN` (BR-007). */
@Controller('api/v1')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomUsage: RoomUsageService,
  ) {}

  @Get('rooms')
  @RequiresScopes(SMART_SCOPES.USER_READ)
  async list(@Query() query: PageQueryDto): Promise<RoomPage> {
    return this.roomsService.list(query.page ?? DEFAULT_PAGE, query.pageSize ?? DEFAULT_PAGE_SIZE);
  }

  @Post('admin/rooms')
  @RequiresRoles(Role.ADMIN)
  async create(@Body() dto: CreateRoomDto): Promise<RoomResponseDto> {
    return this.roomsService.create(dto);
  }

  @Patch('admin/rooms/:id')
  @RequiresRoles(Role.ADMIN)
  async update(
    @Param() params: RoomIdParamDto,
    @Body() dto: UpdateRoomDto,
  ): Promise<RoomResponseDto> {
    return this.roomsService.update(params.id, dto);
  }

  /**
   * API §4.7 — schedules and upcoming bookings that use the room; `inUse`
   * mirrors the `ROOM_IN_USE` rule of §4.6. Read-only, hence `user/*.read`.
   */
  @Get('admin/rooms/:id/usage')
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  async usage(@Param() params: RoomIdParamDto): Promise<RoomUsageResponseDto> {
    return this.roomUsage.usage(params.id);
  }

  @Delete('admin/rooms/:id')
  @RequiresRoles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: RoomIdParamDto): Promise<void> {
    await this.roomsService.remove(params.id);
  }
}
