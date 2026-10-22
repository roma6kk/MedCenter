import { Injectable } from '@nestjs/common';
import { Role } from '@medcenter/contracts';

import { AccountFactory } from './account-factory.service';
import type { RegisterPatientDto } from './dto/register-patient.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import { toUserResponse } from './user-view.mapper';

/**
 * API §2.2.6 — public self-registration of a patient (A-6): the account gets
 * exactly the PATIENT role and its own FHIR `Patient`; the role is never taken
 * from the request. The ticked account-consent checkbox is stored on the user row only (art. 5,
 * Law 99-Z); it never creates the FHIR `Consent` of the electronic record (ADR-019).
 */
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
      },
      { event: 'user.registered', ...(requestId !== undefined ? { requestId } : {}) },
    );
    return toUserResponse(user);
  }
}
