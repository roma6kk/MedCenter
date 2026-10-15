import type { Role } from '@medcenter/contracts';

import type { ExternalResourceType } from '../entities/external-link.entity';

/** Bare FHIR ids from `auth.external_link`, at most one per resource type. */
export interface UserLinks {
  readonly patientId?: string;
  readonly practitionerRoleId?: string;
}

/** A user as the domain sees it: the `user` row plus its roles and FHIR links. */
export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly isActive: boolean;
  readonly roles: ReadonlyArray<Role>;
  readonly links: UserLinks;
  readonly createdAt: Date;
}

export interface NewUser {
  readonly email: string;
  readonly passwordHash: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roles: ReadonlyArray<Role>;
}

/**
 * Only the given fields change; `roles` replaces the whole role set.
 * `practitionerRoleId` links the DOCTOR's `PractitionerRole` (an id) or
 * releases it (`null`).
 */
export interface UserChanges {
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly isActive?: boolean;
  readonly roles?: ReadonlyArray<Role>;
  readonly practitionerRoleId?: string | null;
}

export interface UserListQuery {
  readonly role?: Role;
  /** Case-insensitive substring of email, first or last name. */
  readonly search?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface UserPage {
  readonly items: ReadonlyArray<UserRecord>;
  readonly total: number;
}

/**
 * Persistence port of the `users` module (schema `auth`). The TypeORM adapter
 * is the production implementation; the in-memory one backs unit and e2e
 * suites, so both must honour the same contract — in particular the two
 * uniqueness errors below.
 */
export interface UserStore {
  findById(id: string): Promise<UserRecord | null>;
  /** `email` must already be normalised (`normaliseEmail`). */
  findByEmail(email: string): Promise<UserRecord | null>;
  /** Creates the user and its roles atomically. Throws `DuplicateEmailError`. */
  create(user: NewUser): Promise<UserRecord>;
  /**
   * `null` when the user does not exist. Every change — scalars, roles and the
   * `PractitionerRole` link — is applied atomically: when it throws
   * `DuplicateEmailError` or `ResourceAlreadyLinkedError`, nothing was changed.
   */
  update(id: string, changes: UserChanges): Promise<UserRecord | null>;
  /** Hard delete — only for compensating a registration that never completed. */
  remove(id: string): Promise<void>;
  /** Upserts the user's link of `resourceType`. Throws `ResourceAlreadyLinkedError`. */
  link(userId: string, resourceType: ExternalResourceType, resourceId: string): Promise<void>;
  list(query: UserListQuery): Promise<UserPage>;
}

export const USER_STORE = Symbol('USER_STORE');

export class DuplicateEmailError extends Error {
  constructor() {
    super('A user with this email already exists');
    this.name = 'DuplicateEmailError';
  }
}

export class ResourceAlreadyLinkedError extends Error {
  constructor(readonly resourceType: ExternalResourceType) {
    super(`This ${resourceType} is already linked to another user`);
    this.name = 'ResourceAlreadyLinkedError';
  }
}
