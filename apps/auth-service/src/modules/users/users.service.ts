import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  buildPaginatedResponse,
  type PaginatedResponseDto,
} from '@medcenter/contracts';

import { normaliseEmail } from '../../config/auth-env';
import type { AuditActor } from '../audit/audit-event.builder';
import { AuditService } from '../audit/audit.service';
import { AccountFactory } from './account-factory.service';
import { assertUpdatable } from './account-rules';
import type { CreateUserDto } from './dto/create-user.dto';
import type { ListUsersQueryDto } from './dto/list-users-query.dto';
import type { MeResponseDto } from './dto/me-response.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UserDetailsResponseDto, UserResponseDto } from './dto/user-response.dto';
import { PatientProvisioner } from './patient-provisioner';
import {
  DuplicateEmailError,
  ResourceAlreadyLinkedError,
  USER_STORE,
  type UserChanges,
  type UserRecord,
  type UserStore,
} from './store/user-store';
import { changesOf, demographicsOf, inverseOf } from './user-changes';
import { emailTaken, practitionerRoleTaken, selfLockout, userNotFound } from './user-errors';
import { linkedRefs } from './user-links';
import { toUserDetails, toUserResponse } from './user-view.mapper';

/** The domain error a store refusal stands for; anything else is not ours to translate. */
function conflictOf(error: unknown): unknown {
  if (error instanceof DuplicateEmailError) {
    return emailTaken();
  }
  return error instanceof ResourceAlreadyLinkedError ? practitionerRoleTaken() : error;
}

/**
 * Admin user management (API §2.2.1–2.2.5, FR-015) and the caller's own
 * profile (§2.2.7). Deletion is a soft deactivation (`isActive=false`): the row
 * — and with it the audit trail and FHIR links — stays. Every mutation writes
 * an `AuditEvent` (FR-021).
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(USER_STORE) private readonly store: UserStore,
    private readonly accounts: AccountFactory,
    private readonly patients: PatientProvisioner,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQueryDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const found = await this.store.list({
      page,
      pageSize,
      ...(query.role !== undefined ? { role: query.role } : {}),
      ...(query.search !== undefined ? { search: query.search } : {}),
    });
    return buildPaginatedResponse(found.items.map(toUserResponse), {
      page,
      pageSize,
      totalItems: found.total,
      totalPages: Math.ceil(found.total / pageSize),
    });
  }

  async getById(id: string): Promise<UserDetailsResponseDto> {
    return toUserDetails(await this.require(id));
  }

  async me(userId: string): Promise<MeResponseDto> {
    return toUserDetails(await this.require(userId));
  }

  async create(dto: CreateUserDto, actor: AuditActor): Promise<UserDetailsResponseDto> {
    const user = await this.accounts.create(dto, { event: 'user.created', actor });
    return toUserDetails(user);
  }

  /**
   * `PATCH` is all-or-nothing. The `auth` changes — fields, roles and the
   * `PractitionerRole` link — commit in one store transaction, so a `409`
   * leaves the account as it was. The `Patient` of the account is synced
   * after it; when HAPI refuses, the commit is reverted and the request fails
   * with nothing changed. A change that stays committed always has its `AuditEvent`.
   */
  async update(id: string, dto: UpdateUserDto, actor: AuditActor): Promise<UserDetailsResponseDto> {
    const current = await this.require(id);
    assertUpdatable(current, dto, actor.sub);
    await this.assertEmailFree(current, dto.email);
    if (typeof dto.practitionerRoleId === 'string') {
      await this.patients.assertPractitionerRoleExists(dto.practitionerRoleId);
    }
    const changes = changesOf(dto, current);
    const updated = await this.applyChanges(id, changes);
    await this.syncPatient(current, updated, changes, dto, actor);
    await this.recordUpdate(current, updated, actor, dto.isActive === false ? 'user.deactivated' : 'user.updated');
    return toUserDetails(updated);
  }

  /** API §2.2.5: soft delete — `isActive=false`, the row stays. */
  async deactivate(id: string, actor: AuditActor): Promise<UserDetailsResponseDto> {
    if (id === actor.sub) {
      throw selfLockout();
    }
    const current = await this.require(id);
    const updated = await this.applyChanges(id, { isActive: false });
    await this.recordUpdate(current, updated, actor, 'user.deactivated');
    return toUserDetails(updated);
  }

  private async require(id: string): Promise<UserRecord> {
    const user = await this.store.findById(id);
    if (user === null) {
      throw userNotFound();
    }
    return user;
  }

  private async assertEmailFree(current: UserRecord, email: string | undefined): Promise<void> {
    if (email === undefined || normaliseEmail(email) === current.email) {
      return;
    }
    if ((await this.store.findByEmail(normaliseEmail(email))) !== null) {
      throw emailTaken();
    }
  }

  private async applyChanges(id: string, changes: UserChanges): Promise<UserRecord> {
    let updated: UserRecord | null;
    try {
      updated = await this.store.update(id, changes);
    } catch (error: unknown) {
      throw conflictOf(error);
    }
    if (updated === null) {
      throw userNotFound();
    }
    return updated;
  }

  /** Keeps the FHIR `Patient` in step with the account; a refusal by HAPI takes the account change back. */
  private async syncPatient(
    before: UserRecord,
    after: UserRecord,
    changes: UserChanges,
    dto: UpdateUserDto,
    actor: AuditActor,
  ): Promise<void> {
    const demographics = demographicsOf(dto);
    if (demographics === null || after.links.patientId === undefined) {
      return;
    }
    try {
      await this.patients.updateDemographics(after.links.patientId, demographics);
    } catch (error: unknown) {
      await this.revert(before, after, changes, actor);
      throw error;
    }
  }

  private async revert(before: UserRecord, after: UserRecord, changes: UserChanges, actor: AuditActor): Promise<void> {
    try {
      await this.store.update(before.id, inverseOf(before, changes));
    } catch (error: unknown) {
      this.logger.error(
        { err: error, userId: before.id, requestId: actor.requestId },
        'The Patient sync failed and the account change could not be reverted; the account keeps the new values',
      );
      await this.recordUpdate(before, after, actor, 'user.updated', 'The Patient sync failed and the change was not reverted');
    }
  }

  /** The journal names every resource the change touched: those before it and those after it (a released link). */
  private async recordUpdate(
    before: UserRecord,
    after: UserRecord,
    actor: AuditActor,
    event: string,
    failure?: string,
  ): Promise<void> {
    await this.audit.recordUserChange({
      action: 'update',
      actor,
      userId: after.id,
      event,
      resourceRefs: [...new Set([...linkedRefs(before.links), ...linkedRefs(after.links)])],
      ...(failure !== undefined ? { outcome: 'failed' as const, outcomeDesc: failure } : {}),
    });
  }
}
