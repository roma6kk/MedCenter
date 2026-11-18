import { Body, Controller, Get, Post, Req, UseInterceptors } from '@nestjs/common';
import { ApiProblems, claimsOf, GUARD_PROBLEM_STATUSES, Public, RateLimit } from '@medcenter/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RegisterPatientDto } from './dto/register-patient.dto';
import type { MeResponseDto } from './dto/me-response.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import { MeResponseDoc, UserResponseDoc } from './dto/user-response.doc';
import { NoStoreInterceptor } from './no-store.interceptor';
import { RegistrationService } from './registration.service';
import type { AuthenticatedRequest } from './request-actor';
import { UsersService } from './users.service';

const REGISTER_RATE_LIMIT = 10;

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
  @ApiProblems([400, 409, 422, 429, 500], {
    409: 'EMAIL_TAKEN: a user with this email already exists',
    422: 'AGE_RESTRICTED: the patient is under 18 on the registration date',
  })
  @RateLimit(REGISTER_RATE_LIMIT)
  @Post('auth/register')
  register(@Body() dto: RegisterPatientDto, @Req() request: AuthenticatedRequest): Promise<UserResponseDto> {
    return this.registration.registerPatient(dto, request.requestId);
  }

  @ApiOperation({ summary: '2.2.7 The caller\'s own profile' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'The account of the token with its ExternalLink rows and the account consent', type: MeResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 404])
  @Get('me')
  me(@Req() request: AuthenticatedRequest): Promise<MeResponseDto> {
    return this.users.me(claimsOf(request).sub);
  }
}
