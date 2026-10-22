import { Role, type Role as RoleName } from '@medcenter/contracts';
import { In, type DataSource, type EntityManager, type Repository } from 'typeorm';

import { ExternalLink, type ExternalResourceType } from '../entities/external-link.entity';
import { Role as RoleEntity } from '../entities/role.entity';
import { UserRole } from '../entities/user-role.entity';
import { User } from '../entities/user.entity';
import {
  DuplicateEmailError,
  ResourceAlreadyLinkedError,
  type NewUser,
  type UserChanges,
  type UserLinks,
  type UserListQuery,
  type UserPage,
  type UserRecord,
  type UserStore,
} from './user-store';

const UNIQUE_VIOLATION = '23505';
const CATALOGUE_ROLES: ReadonlySet<string> = new Set<string>(Object.values(Role));

interface DriverErrorShape {
  readonly code?: unknown;
  readonly constraint?: unknown;
}

/** Name of the violated unique constraint, or `null` for any other failure. */
export function uniqueViolationOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const driver = ('driverError' in error ? error.driverError : error) as DriverErrorShape | null;
  if (driver === null || typeof driver !== 'object' || driver.code !== UNIQUE_VIOLATION) {
    return null;
  }
  return typeof driver.constraint === 'string' ? driver.constraint : '';
}

/** Escapes `LIKE` wildcards so a search for `50%` matches the literal text. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function toRecord(user: User, roles: ReadonlyArray<RoleName>, links: UserLinks): UserRecord {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
    roles,
    links,
    createdAt: user.createdAt,
    ...(user.accountConsentAt !== null && user.accountConsentAt !== undefined ? { accountConsentAt: user.accountConsentAt } : {}),
    ...(user.accountConsentVersion !== null && user.accountConsentVersion !== undefined ? { accountConsentVersion: user.accountConsentVersion } : {}),
  };
}

function linkKey(resourceType: string): keyof UserLinks | null {
  if (resourceType === 'Patient') {
    return 'patientId';
  }
  return resourceType === 'PractitionerRole' ? 'practitionerRoleId' : null;
}

/**
 * TypeORM adapter of `UserStore` over the `auth` schema. Multi-row writes
 * (a user and its roles) run in one transaction; uniqueness is enforced by the
 * database and translated into the domain errors of the port.
 */
export class TypeOrmUserStore implements UserStore {
  constructor(private readonly dataSource: DataSource) {}

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.users().findOneBy({ id });
    return user === null ? null : this.hydrateOne(user);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.users().findOneBy({ email });
    return user === null ? null : this.hydrateOne(user);
  }

  async create(input: NewUser): Promise<UserRecord> {
    return this.translateEmailConflict(() =>
      this.dataSource.transaction(async (manager) => {
        const user = await manager.save(
          manager.create(User, {
            email: input.email,
            passwordHash: input.passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            isActive: true,
            accountConsentAt: input.accountConsent?.at ?? null,
            accountConsentVersion: input.accountConsent?.version ?? null,
          }),
        );
        await this.assignRoles(manager, user.id, input.roles);
        return toRecord(user, [...input.roles], {});
      }),
    );
  }

  async update(id: string, changes: UserChanges): Promise<UserRecord | null> {
    const updated = await this.translateEmailConflict(() =>
      this.dataSource.transaction(async (manager) => {
        const user = await manager.findOneBy(User, { id });
        if (user === null) {
          return null;
        }
        const { roles, practitionerRoleId, ...scalars } = changes;
        const saved = await manager.save(Object.assign(user, scalars));
        if (roles !== undefined) {
          await manager.delete(UserRole, { userId: id });
          await this.assignRoles(manager, id, roles);
        }
        if (practitionerRoleId !== undefined) {
          await this.setPractitionerRole(manager, id, practitionerRoleId);
        }
        return saved;
      }),
    );
    return updated === null ? null : this.hydrateOne(updated);
  }

  async remove(id: string): Promise<void> {
    // `user_role`, `external_link` and `oauth_token` cascade (Init migration).
    await this.users().delete({ id });
  }

  async link(userId: string, resourceType: ExternalResourceType, resourceId: string): Promise<void> {
    await this.upsertLink(this.dataSource.manager, userId, resourceType, resourceId);
  }

  async list(query: UserListQuery): Promise<UserPage> {
    const builder = this.users().createQueryBuilder('u');
    if (query.role !== undefined) {
      builder.andWhere(
        `EXISTS (SELECT 1 FROM "auth"."user_role" ur JOIN "auth"."role" r ON r."id" = ur."role_id"
          WHERE ur."user_id" = u.id AND r."name" = :role)`,
        { role: query.role },
      );
    }
    const term = query.search?.trim() ?? '';
    if (term.length > 0) {
      builder.andWhere('(u.email ILIKE :term OR u.firstName ILIKE :term OR u.lastName ILIKE :term)', {
        term: `%${escapeLike(term)}%`,
      });
    }
    const [rows, total] = await builder
      .orderBy('u.lastName', 'ASC')
      .addOrderBy('u.firstName', 'ASC')
      .addOrderBy('u.id', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
    return { items: await this.hydrateMany(rows), total };
  }

  private users(): Repository<User> {
    return this.dataSource.getRepository(User);
  }

  /** Links `resourceId`, or releases the user's `PractitionerRole` when it is `null`. */
  private async setPractitionerRole(manager: EntityManager, userId: string, resourceId: string | null): Promise<void> {
    if (resourceId === null) {
      await manager.delete(ExternalLink, { userId, resourceType: 'PractitionerRole' });
      return;
    }
    await this.upsertLink(manager, userId, 'PractitionerRole', resourceId);
  }

  /** The `ResourceAlreadyLinkedError` leaves the enclosing transaction (if any) to roll back. */
  private async upsertLink(
    manager: EntityManager,
    userId: string,
    resourceType: ExternalResourceType,
    resourceId: string,
  ): Promise<void> {
    try {
      await manager
        .createQueryBuilder()
        .insert()
        .into(ExternalLink)
        .values({ userId, resourceType, resourceId })
        .orUpdate(['resource_id'], ['user_id', 'resource_type'])
        .execute();
    } catch (error: unknown) {
      if (uniqueViolationOf(error) !== null) {
        throw new ResourceAlreadyLinkedError(resourceType);
      }
      throw error;
    }
  }

  private async assignRoles(manager: EntityManager, userId: string, roles: ReadonlyArray<RoleName>): Promise<void> {
    if (roles.length === 0) {
      return;
    }
    const rows = await manager.findBy(RoleEntity, { name: In([...roles]) });
    if (rows.length !== new Set(roles).size) {
      // The catalogue is seeded by migration 1700000000001; a gap is a deployment defect.
      throw new Error(`Role catalogue is incomplete: expected ${roles.join(', ')}`);
    }
    await manager.insert(
      UserRole,
      rows.map((role) => ({ userId, roleId: role.id })),
    );
  }

  private async hydrateOne(user: User): Promise<UserRecord> {
    const [record] = await this.hydrateMany([user]);
    return record ?? toRecord(user, [], {});
  }

  private async hydrateMany(users: ReadonlyArray<User>): Promise<UserRecord[]> {
    if (users.length === 0) {
      return [];
    }
    const ids = users.map((user) => user.id);
    const [roles, links] = await Promise.all([this.rolesOf(ids), this.linksOf(ids)]);
    return users.map((user) => toRecord(user, roles.get(user.id) ?? [], links.get(user.id) ?? {}));
  }

  private async rolesOf(userIds: ReadonlyArray<string>): Promise<Map<string, RoleName[]>> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('ur.userId', 'userId')
      .addSelect('r.name', 'name')
      .from(UserRole, 'ur')
      .innerJoin(RoleEntity, 'r', 'r.id = ur.roleId')
      .where('ur.userId IN (:...userIds)', { userIds })
      .getRawMany<{ readonly userId: string; readonly name: string }>();
    const byUser = new Map<string, RoleName[]>();
    for (const row of rows) {
      if (CATALOGUE_ROLES.has(row.name)) {
        byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.name as RoleName]);
      }
    }
    return byUser;
  }

  private async linksOf(userIds: ReadonlyArray<string>): Promise<Map<string, UserLinks>> {
    const rows = await this.dataSource.getRepository(ExternalLink).findBy({ userId: In([...userIds]) });
    const byUser = new Map<string, UserLinks>();
    for (const row of rows) {
      const key = linkKey(row.resourceType);
      if (key !== null) {
        byUser.set(row.userId, { ...byUser.get(row.userId), [key]: row.resourceId });
      }
    }
    return byUser;
  }

  private async translateEmailConflict<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      // The only unique constraints of `auth.user` are on the email (Init + lower(email)).
      if (uniqueViolationOf(error) !== null) {
        throw new DuplicateEmailError();
      }
      throw error;
    }
  }
}
