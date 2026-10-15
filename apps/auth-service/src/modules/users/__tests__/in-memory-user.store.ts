import { randomUUID } from 'node:crypto';

import type { ExternalResourceType } from '../entities/external-link.entity';
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
} from '../store/user-store';

function linkKey(resourceType: ExternalResourceType): keyof UserLinks {
  return resourceType === 'Patient' ? 'patientId' : 'practitionerRoleId';
}

/** A string links the PractitionerRole, `null` releases it. */
function withPractitionerRole(links: UserLinks, practitionerRoleId: string | null): UserLinks {
  return {
    ...(links.patientId !== undefined ? { patientId: links.patientId } : {}),
    ...(practitionerRoleId !== null ? { practitionerRoleId } : {}),
  };
}

function matches(user: UserRecord, query: UserListQuery): boolean {
  if (query.role !== undefined && !user.roles.includes(query.role)) {
    return false;
  }
  const term = query.search?.toLowerCase();
  if (term === undefined || term.length === 0) {
    return true;
  }
  return [user.email, user.firstName, user.lastName].some((value) => value.toLowerCase().includes(term));
}

/**
 * Test double of the `auth` schema with the same uniqueness rules as the
 * migrations: one email per account (case-insensitive) and one user per
 * linked FHIR resource.
 */
export class InMemoryUserStore implements UserStore {
  readonly users = new Map<string, UserRecord>();

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async create(input: NewUser): Promise<UserRecord> {
    this.assertEmailFree(input.email, undefined);
    const user: UserRecord = { ...input, id: randomUUID(), isActive: true, links: {}, createdAt: new Date() };
    this.users.set(user.id, user);
    return user;
  }

  async update(id: string, changes: UserChanges): Promise<UserRecord | null> {
    const current = this.users.get(id);
    if (current === undefined) {
      return null;
    }
    // Every check precedes the write, so a refused change leaves the user untouched (as a rolled-back transaction does).
    if (changes.email !== undefined) {
      this.assertEmailFree(changes.email, id);
    }
    const { practitionerRoleId, ...scalars } = changes;
    if (typeof practitionerRoleId === 'string') {
      this.assertLinkFree(id, 'PractitionerRole', practitionerRoleId);
    }
    const updated: UserRecord = {
      ...current,
      ...scalars,
      links: practitionerRoleId === undefined ? current.links : withPractitionerRole(current.links, practitionerRoleId),
    };
    this.users.set(id, updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    this.users.delete(id);
  }

  async link(userId: string, resourceType: ExternalResourceType, resourceId: string): Promise<void> {
    const key = linkKey(resourceType);
    this.assertLinkFree(userId, resourceType, resourceId);
    const user = this.users.get(userId);
    if (user !== undefined) {
      this.users.set(userId, { ...user, links: { ...user.links, [key]: resourceId } });
    }
  }

  async list(query: UserListQuery): Promise<UserPage> {
    const found = [...this.users.values()]
      .filter((user) => matches(user, query))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
    const start = (query.page - 1) * query.pageSize;
    return { items: found.slice(start, start + query.pageSize), total: found.length };
  }

  private assertLinkFree(userId: string, resourceType: ExternalResourceType, resourceId: string): void {
    const key = linkKey(resourceType);
    const owner = [...this.users.values()].find((user) => user.links[key] === resourceId);
    if (owner !== undefined && owner.id !== userId) {
      throw new ResourceAlreadyLinkedError(resourceType);
    }
  }

  private assertEmailFree(email: string, ownerId: string | undefined): void {
    const taken = [...this.users.values()].some(
      (user) => user.email.toLowerCase() === email.toLowerCase() && user.id !== ownerId,
    );
    if (taken) {
      throw new DuplicateEmailError();
    }
  }
}
