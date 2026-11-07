import { Injectable } from '@nestjs/common';
import { Role } from '@medcenter/contracts';

import { AccountFactory } from './account-factory.service';
import type { RegisterPatientDto } from './dto/register-patient.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import { toUserResponse } from './user-view.mapper';

@Injectable()
export class RegistrationService {
  constructor(private readonly accounts: AccountFactory) {}

  async registerPatient(dto: RegisterPatientDto, requestId?: string): Promise<UserResponseDto> {
    const user = await this.accounts.create(
      {
        email: dto.email,
        password: dto.password,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roles: [Role.PATIENT],
        birthDate: dto.birthDate,
        accountConsentVersion: dto.accountConsent.textVersion,
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      },
      { event: 'user.registered', ...(requestId !== undefined ? { requestId } : {}) },
    );
    return toUserResponse(user);
  }
}
