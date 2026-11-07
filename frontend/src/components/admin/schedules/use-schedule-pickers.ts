'use client';

import { useMemo } from 'react';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { useT } from '@/lib/i18n/use-t';
import { roomLabel } from '../rooms/room-label';
import { useAdminRooms } from '../rooms/use-admin-rooms';
import { useAdminServices } from '../services/use-admin-services';
import { useAdminUsers } from '../users/use-admin-users';
import { referenceId, type AdminUser } from '../users/user-types';

interface PickerOption {
  readonly value: string;
  readonly label: string;
}

interface ServicePickerOption extends PickerOption {
  readonly durationMin: number;
}

export interface SchedulePickers {
  readonly doctors: ReadonlyArray<PickerOption>;
  readonly allDoctors: ReadonlyArray<PickerOption>;
  readonly rooms: ReadonlyArray<PickerOption>;
  readonly services: ReadonlyArray<ServicePickerOption>;
  readonly isTruncated: boolean;
  readonly isPending: boolean;
  readonly error: Error | null;
}

const ALL_PAGE_SIZE = 100;

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

// A schedule's actor is a `PractitionerRole`, not a `Practitioner` (`GET /doctors` hands out practitioner ids), so doctors come from the DOCTOR accounts.
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
  const roomOptions = useMemo(() => (rooms.data?.items ?? []).map((room) => ({ value: room.id, label: roomLabel(room) })), [rooms.data]);
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
