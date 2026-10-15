import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { RequiresRoles, RequiresScopes } from '@medcenter/common';
import { Role, SMART_SCOPES, type PaginatedResponseDto } from '@medcenter/contracts';

import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { UserDetailsResponseDto, UserResponseDto } from './dto/user-response.dto';
import { NoStoreInterceptor } from './no-store.interceptor';
import { actorOf, type AuthenticatedRequest } from './request-actor';
import { UsersService } from './users.service';

/** Ids of `auth.user` are UUID v4 (API §0); anything else is `400 VALIDATION_ERROR`, never a database error. */
const USER_ID = new ParseUUIDPipe({ version: '4' });

/**
 * API §2.2.1–2.2.5 — user management (FR-015, BR-007). ADMIN only, and the
 * SMART `user/*` scope of the operation on top (scope matrix, API §0). Every
 * answer carries personal data, so none may be cached.
 */
@Controller('api/v1/admin/users')
@UseInterceptors(NoStoreInterceptor)
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  create(@Body() dto: CreateUserDto, @Req() request: AuthenticatedRequest): Promise<UserDetailsResponseDto> {
    return this.users.create(dto, actorOf(request));
  }

  @Get()
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  list(@Query() query: ListUsersQueryDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    return this.users.list(query);
  }

  @Get(':id')
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  getById(@Param('id', USER_ID) id: string): Promise<UserDetailsResponseDto> {
    return this.users.getById(id);
  }

  @Patch(':id')
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  update(
    @Param('id', USER_ID) id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserDetailsResponseDto> {
    return this.users.update(id, dto, actorOf(request));
  }

  /** Soft delete: the account is deactivated and returned (200), never removed. */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  deactivate(@Param('id', USER_ID) id: string, @Req() request: AuthenticatedRequest): Promise<UserDetailsResponseDto> {
    return this.users.deactivate(id, actorOf(request));
  }
}
