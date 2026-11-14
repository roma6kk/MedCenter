import type { Role } from '@medcenter/contracts';

import type { ExternalResourceType } from '../entities/external-link.entity';

export interface UserLinks {
  readonly patientId?: string;
  readonly practitionerRoleId?: string;
}

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
  readonly accountConsentAt?: Date;
  readonly accountConsentVersion?: string;
  readonly accountConsentWithdrawnAt?: Date;
}

export interface NewUser {
  readonly email: string;
  readonly passwordHash: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roles: ReadonlyArray<Role>;
  readonly accountConsent?: { readonly at: Date; readonly version: string };
}

export interface UserChanges {
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly isActive?: boolean;
  readonly accountConsentWithdrawnAt?: Date;
  readonly roles?: ReadonlyArray<Role>;
  readonly practitionerRoleId?: string | null;
}

export interface UserListQuery {
  readonly role?: Role;
  readonly search?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface UserPage {
  readonly items: ReadonlyArray<UserRecord>;
  readonly total: number;
}

export interface UserStore {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(user: NewUser): Promise<UserRecord>;
  update(id: string, changes: UserChanges): Promise<UserRecord | null>;
  remove(id: string): Promise<void>;
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

const MAX_SEARCH_TOKENS = 5;

export function searchTokens(search: string | undefined): string[] {
  return (search ?? '').split(/\s+/).filter((token) => token.length > 0).slice(0, MAX_SEARCH_TOKENS);
}
