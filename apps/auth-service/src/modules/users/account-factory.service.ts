import { Inject, Injectable, Logger } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import { FhirClientError } from '@medcenter/fhir';

import { normaliseEmail } from '../../config/auth-env';
import type { AuditActor } from '../audit/audit-event.builder';
import { AuditService } from '../audit/audit.service';
import { assertCreatable } from './account-rules';
import { PasswordHasher } from './password-hasher';
import { PatientEventsPublisher } from './patient-events.publisher';
import { PatientProvisioner, type PatientGender } from './patient-provisioner';
import { emailTaken, invalidUserInput, practitionerRoleTaken } from './user-errors';
import { linkedRefs } from './user-links';
import {
  DuplicateEmailError,
  ResourceAlreadyLinkedError,
  USER_STORE,
  type UserRecord,
  type UserStore,
} from './store/user-store';

export interface NewAccount {
  readonly email: string;
  readonly password: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roles: ReadonlyArray<Role>;
  readonly birthDate?: string;
  readonly gender?: PatientGender;
  readonly practitionerRoleId?: string;
}

/** Audit context: `actor` absent means the account acts on itself (self-registration). */
export interface AccountContext {
  readonly event: string;
  readonly actor?: AuditActor;
  readonly requestId?: string;
}

/** A timeout or a dropped connection: HAPI may have stored the resource although no answer came back. */
function isOutcomeUnknown(error: unknown): boolean {
  return error instanceof FhirClientError && error.upstreamStatus === undefined;
}

/**
 * Creates an account end to end — `auth.user` + roles, the FHIR `Patient` of a
 * PATIENT account, the `ExternalLink` rows, the `AuditEvent` and
 * `patient.registered.v1`. Shared by self-registration (API §2.2.6), the admin
 * create (§2.2.1) and the bootstrap administrator.
 *
 * The user row is written first; when a later step fails (HAPI, a taken
 * `PractitionerRole`) the account is compensated — removed again together
 * with a Patient it already created — so a half-made account never remains.
 */
@Injectable()
export class AccountFactory {
  private readonly logger = new Logger(AccountFactory.name);

  constructor(
    @Inject(USER_STORE) private readonly store: UserStore,
    private readonly hasher: PasswordHasher,
    private readonly patients: PatientProvisioner,
    private readonly audit: AuditService,
    private readonly events: PatientEventsPublisher,
  ) {}

  async create(input: NewAccount, context: AccountContext): Promise<UserRecord> {
    const roles = [...new Set(input.roles)];
    assertCreatable({ ...input, roles });
    if (input.practitionerRoleId !== undefined) {
      await this.patients.assertPractitionerRoleExists(input.practitionerRoleId);
    }
    const email = normaliseEmail(input.email);
    const user = await this.insertUser({ ...input, email, roles });
    const linked = await this.linkResources(user, input);
    await this.audit.recordUserChange({
      action: 'create',
      actor: context.actor ?? { sub: linked.id, ...(context.requestId !== undefined ? { requestId: context.requestId } : {}) },
      userId: linked.id,
      event: context.event,
      resourceRefs: linkedRefs(linked.links),
    });
    if (linked.links.patientId !== undefined) {
      await this.events.publishRegistered(linked.links.patientId, email);
    }
    return linked;
  }

  private async insertUser(input: NewAccount): Promise<UserRecord> {
    if ((await this.store.findByEmail(input.email)) !== null) {
      throw emailTaken();
    }
    const passwordHash = await this.hasher.hash(input.password);
    try {
      return await this.store.create({
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        roles: input.roles,
      });
    } catch (error: unknown) {
      throw error instanceof DuplicateEmailError ? emailTaken() : error;
    }
  }

  private async linkResources(user: UserRecord, input: NewAccount): Promise<UserRecord> {
    let patientId: string | undefined;
    try {
      if (user.roles.includes(Role.PATIENT)) {
        patientId = await this.provisionPatient(user, input);
      }
      if (input.practitionerRoleId !== undefined) {
        await this.store.link(user.id, 'PractitionerRole', input.practitionerRoleId);
      }
    } catch (error: unknown) {
      await this.compensate(user.id, patientId, isOutcomeUnknown(error));
      throw error instanceof ResourceAlreadyLinkedError ? practitionerRoleTaken() : error;
    }
    return {
      ...user,
      links: {
        ...(patientId !== undefined ? { patientId } : {}),
        ...(input.practitionerRoleId !== undefined ? { practitionerRoleId: input.practitionerRoleId } : {}),
      },
    };
  }

  private async provisionPatient(user: UserRecord, input: NewAccount): Promise<string> {
    if (input.birthDate === undefined) {
      throw invalidUserInput('birthDate: required for a PATIENT account');
    }
    const patientId = await this.patients.create({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      birthDate: input.birthDate,
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
    });
    try {
      await this.store.link(user.id, 'Patient', patientId);
    } catch (error: unknown) {
      await this.removePatient(patientId);
      throw error;
    }
    return patientId;
  }

  /**
   * Best effort: the original failure is what the caller sees; a failed undo is logged for an operator.
   * `patientUnknown`: the Patient `create` ended without an answer, so HAPI may hold a Patient whose id never arrived.
   */
  private async compensate(userId: string, patientId: string | undefined, patientUnknown: boolean): Promise<void> {
    try {
      await this.store.remove(userId);
    } catch (error: unknown) {
      this.logger.error({ err: error, userId }, 'Compensation failed: a half-created account remains');
    }
    if (patientId !== undefined) {
      await this.removePatient(patientId);
    } else if (patientUnknown) {
      await this.removeUnconfirmedPatient(userId);
    }
  }

  private async removeUnconfirmedPatient(userId: string): Promise<void> {
    try {
      await this.patients.removeCreatedFor(userId);
    } catch (error: unknown) {
      this.logger.error({ err: error, userId }, 'Compensation failed: an orphan FHIR Patient may remain');
    }
  }

  private async removePatient(patientId: string): Promise<void> {
    try {
      await this.patients.remove(patientId);
    } catch (error: unknown) {
      this.logger.error({ err: error, patientId }, 'Compensation failed: an orphan FHIR Patient remains');
    }
  }
}
