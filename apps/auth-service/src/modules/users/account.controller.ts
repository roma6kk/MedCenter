import { Body, Controller, Get, Post, Req, UseInterceptors } from '@nestjs/common';
import { claimsOf, Public, RateLimit } from '@medcenter/common';

import { RegisterPatientDto } from './dto/register-patient.dto';
import type { MeResponseDto } from './dto/me-response.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import { NoStoreInterceptor } from './no-store.interceptor';
import { RegistrationService } from './registration.service';
import type { AuthenticatedRequest } from './request-actor';
import { UsersService } from './users.service';

/** Registrations per minute per client IP (NFR-006): enough for a family, not for a bot. */
export const REGISTER_RATE_LIMIT = 10;

/**
 * API §2.2.6 (public self-registration) and §2.2.7 (the caller's own profile).
 * Both answer with the account's personal data, so neither may be cached.
 */
@Controller('api/v1')
@UseInterceptors(NoStoreInterceptor)
export class AccountController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @RateLimit(REGISTER_RATE_LIMIT)
  @Post('auth/register')
  register(@Body() dto: RegisterPatientDto, @Req() request: AuthenticatedRequest): Promise<UserResponseDto> {
    return this.registration.registerPatient(dto, request.requestId);
  }

  /** Any valid Bearer token; the account is the token `sub`, never a parameter. */
  @Get('me')
  me(@Req() request: AuthenticatedRequest): Promise<MeResponseDto> {
    return this.users.me(claimsOf(request).sub);
  }
}
