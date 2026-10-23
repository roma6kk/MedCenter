import { Body, Controller, Get, Post, Req, UseInterceptors } from '@nestjs/common';
import { ApiProblems, claimsOf, GUARD_PROBLEM_STATUSES, Public, RateLimit } from '@medcenter/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RegisterPatientDto } from './dto/register-patient.dto';
import type { MeResponseDto } from './dto/me-response.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import { UserDetailsResponseDoc, UserResponseDoc } from './dto/user-response.doc';
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
@ApiTags('auth')
@Controller('api/v1')
@UseInterceptors(NoStoreInterceptor)
export class AccountController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @ApiOperation({ summary: '2.2.6 Register a patient account' })
  @ApiResponse({ status: 201, description: 'The account and its FHIR Patient are created', type: UserResponseDoc })
  @ApiProblems([400, 409, 429, 500], { 409: 'EMAIL_TAKEN: a user with this email already exists' })
  @RateLimit(REGISTER_RATE_LIMIT)
  @Post('auth/register')
  register(@Body() dto: RegisterPatientDto, @Req() request: AuthenticatedRequest): Promise<UserResponseDto> {
    return this.registration.registerPatient(dto, request.requestId);
  }

  /** Any valid Bearer token; the account is the token `sub`, never a parameter. */
  @ApiOperation({ summary: '2.2.7 The caller\'s own profile' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'The account of the token with its ExternalLink rows', type: UserDetailsResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 404])
  @Get('me')
  me(@Req() request: AuthenticatedRequest): Promise<MeResponseDto> {
    return this.users.me(claimsOf(request).sub);
  }
}
