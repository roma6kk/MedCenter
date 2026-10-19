'use client';

import { useMemo } from 'react';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { useT } from '@/lib/i18n/use-t';
import { useAdminRooms } from '../rooms/use-admin-rooms';
import { useAdminServices } from '../services/use-admin-services';
import { useAdminUsers } from '../users/use-admin-users';
import { referenceId, type AdminUser } from '../users/user-types';

export interface PickerOption {
  readonly value: string;
  readonly label: string;
}

export interface ServicePickerOption extends PickerOption {
  readonly durationMin: number;
}

export interface SchedulePickers {
  /** Active doctors linked to a `PractitionerRole`: the ones a new schedule can be made for. */
  readonly doctors: ReadonlyArray<PickerOption>;
  /** Every doctor linked to a `PractitionerRole`, a disabled account marked as such: a schedule outlives its doctor's account, so labels and the doctor filter need them all. */
  readonly allDoctors: ReadonlyArray<PickerOption>;
  readonly rooms: ReadonlyArray<PickerOption>;
  readonly services: ReadonlyArray<ServicePickerOption>;
  /** `true` when a list holds more entries than the one page the pickers read: some doctors, rooms or services are missing. */
  readonly isTruncated: boolean;
  readonly isPending: boolean;
  readonly error: Error | null;
}

const ALL_PAGE_SIZE = 100;

/** `Фамилия Имя` of an option, or the raw id when the list does not know it (a deleted room, a doctor without an account). */
export function labelOf(options: ReadonlyArray<PickerOption>, id: string | undefined): string {
  if (id === undefined || id === '') return '—';
  return options.find((option) => option.value === id)?.label ?? id;
}

function isMissing(page: PaginatedResponse<unknown> | undefined): boolean {
  return page !== undefined && page.meta.totalItems > page.items.length;
}

function linkedDoctors(users: ReadonlyArray<AdminUser>): ReadonlyArray<AdminUser> {
  return users.filter((user) => user.practitionerRoleRef !== null);
}

/**
 * The lists the schedule editor and the schedule table pick from. A schedule's actor is a `PractitionerRole`, not a
 * `Practitioner`: `GET /doctors` hands out practitioner ids, so the doctors come from the DOCTOR accounts, which carry the
 * `PractitionerRole` they are linked to.
 */
export function useSchedulePickers(): SchedulePickers {
  const t = useT('admin.schedules');
  const users = useAdminUsers({ page: 1, role: 'DOCTOR', search: '', pageSize: ALL_PAGE_SIZE });
  const rooms = useAdminRooms(1, ALL_PAGE_SIZE);
  const services = useAdminServices({ page: 1, search: '', pageSize: ALL_PAGE_SIZE });
  const linked = useMemo(() => linkedDoctors(users.data?.items ?? []), [users.data]);
  const doctors = useMemo(() => linked.filter((user) => user.isActive).map((user) => ({ value: referenceId(user.practitionerRoleRef), label: user.name })), [linked]);
  const allDoctors = useMemo(
    () => linked.map((user) => ({ value: referenceId(user.practitionerRoleRef), label: user.isActive ? user.name : t('doctorInactive', { name: user.name }) })),
    [linked, t],
  );
  const roomOptions = useMemo(() => (rooms.data?.items ?? []).map((room) => ({ value: room.id, label: `${room.name} (${room.identifier})` })), [rooms.data]);
  const serviceOptions = useMemo(
    () => (services.data?.items ?? []).map((service) => ({ value: service.id, label: service.name, durationMin: service.defaultDurationMin })),
    [services.data],
  );
  return {
    doctors,
    allDoctors,
    rooms: roomOptions,
    services: serviceOptions,
    isTruncated: isMissing(users.data) || isMissing(rooms.data) || isMissing(services.data),
    isPending: users.isPending || rooms.isPending || services.isPending,
    error: users.error ?? rooms.error ?? services.error,
  };
}
