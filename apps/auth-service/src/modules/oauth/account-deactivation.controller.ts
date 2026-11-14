import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseInterceptors } from '@nestjs/common';
import { ApiProblems, GUARD_PROBLEM_STATUSES, RateLimit, RequiresRoles } from '@medcenter/common';
import { Role } from '@medcenter/contracts';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { DeactivateAccountDto } from '../users/dto/deactivate-account.dto';
import { NoStoreInterceptor } from '../users/no-store.interceptor';
import { actorOf, type AuthenticatedRequest } from '../users/request-actor';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';

const DEACTIVATE_RATE_LIMIT = 5;

@ApiTags('auth')
@ApiBearerAuth()
@Controller('api/v1/me')
@UseInterceptors(NoStoreInterceptor)
export class AccountDeactivationController {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  /** Lives beside the token stores: closing the account also ends the caller's session. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '2.2.8 The patient closes their own account' })
  @ApiResponse({ status: 204, description: 'The account is deactivated and the current session is revoked' })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 429], { 403: 'INVALID_PASSWORD: the password is wrong or the account is already closed' })
  @RequiresRoles(Role.PATIENT)
  @RateLimit(DEACTIVATE_RATE_LIMIT)
  @Post('deactivate')
  async deactivate(@Body() dto: DeactivateAccountDto, @Req() request: AuthenticatedRequest): Promise<void> {
    const actor = actorOf(request);
    await this.users.deactivateSelf(actor.sub, dto.password, actor);
    const sessionId = request.user?.sid;
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      await this.tokens.revoke(sessionId);
    }
  }
}
