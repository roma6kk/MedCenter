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
import { ApiProblems, GUARD_PROBLEM_STATUSES, RequiresRoles, RequiresScopes } from '@medcenter/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role, SMART_SCOPES, type PaginatedResponseDto } from '@medcenter/contracts';

import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { UserDetailsResponseDto, UserResponseDto } from './dto/user-response.dto';
import { UserDetailsResponseDoc, UserPageDoc } from './dto/user-response.doc';
import { NoStoreInterceptor } from './no-store.interceptor';
import { actorOf, type AuthenticatedRequest } from './request-actor';
import { UsersService } from './users.service';

const USER_ID = new ParseUUIDPipe({ version: '4' });

@ApiTags('auth')
@ApiBearerAuth()
@Controller('api/v1/admin/users')
@UseInterceptors(NoStoreInterceptor)
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @ApiOperation({ summary: '2.2.1 Create a user' })
  @ApiResponse({ status: 201, description: 'The created account', type: UserDetailsResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 409], { 409: 'EMAIL_TAKEN or PRACTITIONER_ROLE_TAKEN in detail' })
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  create(@Body() dto: CreateUserDto, @Req() request: AuthenticatedRequest): Promise<UserDetailsResponseDto> {
    return this.users.create(dto, actorOf(request));
  }

  @Get()
  @ApiOperation({ summary: '2.2.2 List users' })
  @ApiResponse({ status: 200, description: 'A page of accounts', type: UserPageDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400])
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  list(@Query() query: ListUsersQueryDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '2.2.3 Get a user card with its ExternalLinks' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User id (UUID v4)' })
  @ApiResponse({ status: 200, description: 'The account', type: UserDetailsResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404])
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  getById(@Param('id', USER_ID) id: string): Promise<UserDetailsResponseDto> {
    return this.users.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '2.2.4 Update a user' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User id (UUID v4)' })
  @ApiResponse({ status: 200, description: 'The updated account', type: UserDetailsResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], {
    409: 'EMAIL_TAKEN, PRACTITIONER_ROLE_TAKEN, SELF_LOCKOUT, or ACCOUNT_CONSENT_WITHDRAWN (isActive: true on an account the patient closed)',
  })
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  update(
    @Param('id', USER_ID) id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserDetailsResponseDto> {
    return this.users.update(id, dto, actorOf(request));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '2.2.5 Deactivate a user (soft delete)' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User id (UUID v4)' })
  @ApiResponse({ status: 200, description: 'The deactivated account', type: UserDetailsResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], { 409: 'SELF_LOCKOUT: an administrator cannot deactivate their own account' })
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  deactivate(@Param('id', USER_ID) id: string, @Req() request: AuthenticatedRequest): Promise<UserDetailsResponseDto> {
    return this.users.deactivate(id, actorOf(request));
  }
}
