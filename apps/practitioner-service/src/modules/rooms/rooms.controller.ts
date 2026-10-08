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
import { RequiresRoles } from '@medcenter/common';
import { Role } from '@medcenter/contracts';

import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import type { RoomResponseDto } from './dto/room-response.dto';
import { RoomsService } from './rooms.service';

/** API §4.3–4.7. Read routes need `user/*.read`; admin routes carry `ADMIN` (BR-007). */
@Controller('api/v1')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get('rooms')
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ): Promise<RoomResponseDto[]> {
    return this.roomsService.list(Number(page), Number(pageSize));
  }

  @Post('admin/rooms')
  @RequiresRoles(Role.ADMIN)
  async create(@Body() dto: CreateRoomDto): Promise<RoomResponseDto> {
    return this.roomsService.create(dto);
  }

  @Patch('admin/rooms/:id')
  @RequiresRoles(Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
  ): Promise<RoomResponseDto> {
    return this.roomsService.update(id, dto);
  }

  @Delete('admin/rooms/:id')
  @RequiresRoles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.roomsService.remove(id);
  }
}
