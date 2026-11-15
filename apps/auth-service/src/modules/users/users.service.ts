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
import { ACCOUNT_RETENTION, accountRetentionFromEnv, closureOf, type AccountRetention } from './account-retention';
import { assertUpdatable } from './account-rules';
import type { CreateUserDto } from './dto/create-user.dto';
import type { ListUsersQueryDto } from './dto/list-users-query.dto';
import type { RetentionExpiredQueryDto } from './dto/retention-expired-query.dto';
import type { MeResponseDto } from './dto/me-response.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { RetentionExpiredItemDto, UserDetailsResponseDto, UserResponseDto } from './dto/user-response.dto';
import { PasswordHasher } from './password-hasher';
import { PatientProvisioner, type PatientDemographicsChange } from './patient-provisioner';
import { USER_STORE, type UserChanges, type UserRecord, type UserStore } from './store/user-store';
import { changesOf, demographicsOf, effectiveChangesOf, effectiveDemographicsOf, inverseOf } from './user-changes';
import { conflictOf, emailTaken, invalidPassword, selfLockout, userNotFound } from './user-errors';
import { linkedRefs } from './user-links';
import { toRetentionExpiredItem, toUserDetails, toUserResponse } from './user-view.mapper';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(USER_STORE) private readonly store: UserStore,
    private readonly accounts: AccountFactory,
    private readonly patients: PatientProvisioner,
    private readonly audit: AuditService,
    private readonly hasher: PasswordHasher,
    @Inject(ACCOUNT_RETENTION) private readonly retention: AccountRetention = accountRetentionFromEnv(),
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

  /** Closed accounts whose retention period is over and which wait for the operator's review; nothing is deleted here. */
  async listRetentionExpired(query: RetentionExpiredQueryDto): Promise<PaginatedResponseDto<RetentionExpiredItemDto>> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const found = await this.store.listRetentionExpired({ now: this.retention.now(), page, pageSize });
    return buildPaginatedResponse(found.items.map(toRetentionExpiredItem), {
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
   * with nothing changed. A change that stays committed always has its `AuditEvent`; a PATCH that changes
   * nothing (the values are already there) writes and journals nothing and answers the unchanged card.
   */
  async update(id: string, dto: UpdateUserDto, actor: AuditActor): Promise<UserDetailsResponseDto> {
    const current = await this.require(id);
    assertUpdatable(current, dto, actor.sub);
    await this.assertEmailFree(current, dto.email);
    if (typeof dto.practitionerRoleId === 'string') {
      await this.patients.assertPractitionerRoleExists(dto.practitionerRoleId);
    }
    const changes = effectiveChangesOf(changesOf(dto, current), current);
    const demographics = effectiveDemographicsOf(demographicsOf(dto), current);
    if (Object.keys(changes).length === 0 && demographics === null) {
      return toUserDetails(current);
    }
    const closure = changes.isActive === undefined ? {} : changes.isActive ? { closedAt: null, retentionUntil: null } : closureOf(this.retention);
    const updated = await this.applyChanges(id, { ...changes, ...closure });
    await this.syncPatient(current, updated, { ...changes, ...closure }, demographics, actor);
    await this.recordUpdate(current, updated, actor, changes.isActive === false ? 'user.deactivated' : 'user.updated');
    return toUserDetails(updated);
  }

  async deactivate(id: string, actor: AuditActor): Promise<UserDetailsResponseDto> {
    if (id === actor.sub) {
      throw selfLockout();
    }
    const current = await this.require(id);
    if (!current.isActive) {
      return toUserDetails(current);
    }
    const updated = await this.applyChanges(id, { isActive: false, ...closureOf(this.retention) });
    await this.recordUpdate(current, updated, actor, 'user.deactivated');
    return toUserDetails(updated);
  }

  /**
   * The patient closes their own account: sign-in stops and the account consent is stamped as withdrawn. Only the
   * `auth` row changes; the Patient and every clinical resource stay with the clinic. A wrong password and an account
   * that is already inactive answer the same 403.
   */
  async deactivateSelf(id: string, password: string, actor: AuditActor): Promise<void> {
    const current = await this.require(id);
    if (!current.isActive || !(await this.hasher.verify(password, current.passwordHash))) {
      throw invalidPassword();
    }
    const updated = await this.applyChanges(id, { isActive: false, accountConsentWithdrawnAt: new Date(), ...closureOf(this.retention) });
    await this.recordUpdate(current, updated, actor, 'user.deactivated');
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

  private async syncPatient(
    before: UserRecord,
    after: UserRecord,
    changes: UserChanges,
    demographics: PatientDemographicsChange | null,
    actor: AuditActor,
  ): Promise<void> {
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
