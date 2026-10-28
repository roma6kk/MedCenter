'use client';

import type { ReactNode } from 'react';
import { CalendarClock } from 'lucide-react';
import { useServices } from '@/components/catalog/use-catalog';
import { roomLabel } from '@/components/admin/rooms/room-label';
import { useAdminRooms } from '@/components/admin/rooms/use-admin-rooms';
import { formatDateKey } from '@/lib/clinic-time';
import { describeWindows } from '@/lib/schedule-windows-text';
import { useT } from '@/lib/i18n/use-t';
import type { ScheduleSummary, WeekDay } from './doctor-types';


/** Names of the rooms (the same read the admin pickers make, so it is cached already when the doctor has just come from there); an unknown room is left out. */
function useRoomNames(): ReadonlyMap<string, string> {
  const rooms = useAdminRooms(1, 100);
  return new Map((rooms.data?.items ?? []).map((room) => [room.id, roomLabel(room)]));
}

function useServiceNames(): ReadonlyMap<string, string> {
  const services = useServices();
  return new Map((services.data?.items ?? []).map((service) => [service.id, service.name]));
}

interface ScheduleLineProps {
  readonly schedule: ScheduleSummary;
  readonly roomName: string | undefined;
  readonly serviceName: string | undefined;
}

/** `Пн–Пт, 09:00–13:00 · Кабинет 101` and under it the service, the slot length and how long the schedule is planned. */
function ScheduleLine({ schedule, roomName, serviceName }: ScheduleLineProps): ReactNode {
  const t = useT('doctor.schedule');
  const groups = describeWindows(schedule.windows, (day: WeekDay) => t(`weekdaysShort.${day}`));
  const when: string = groups.map((group) => `${group.days}, ${group.times}`).join('; ');
  const headline: string = [when === '' ? t('noWindows') : when, roomName].filter((part): part is string => part !== undefined && part !== '').join(' · ');
  const details: ReadonlyArray<string> = [
    serviceName,
    schedule.slotDurationMin === undefined ? undefined : t('slotDuration', { minutes: schedule.slotDurationMin }),
    schedule.horizonTo === undefined ? undefined : t('plannedUntil', { date: formatDateKey(schedule.horizonTo) }),
  ].filter((part): part is string => part !== undefined);
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden="true" className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary-soft-foreground">
        <CalendarClock className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="tabular-nums text-base font-semibold">{headline}</span>
        {details.length === 0 ? null : <span className="text-sm text-muted-foreground">{details.join(' · ')}</span>}
      </span>
    </li>
  );
}

/** The doctor's working windows in words (A11), one line per schedule: no RRULE text and no table of seven days. */
export function ScheduleWindows({ schedules }: { readonly schedules: ReadonlyArray<ScheduleSummary> }): ReactNode {
  const t = useT('doctor.schedule');
  const rooms = useRoomNames();
  const services = useServiceNames();
  const active: ReadonlyArray<ScheduleSummary> = schedules.filter((schedule) => schedule.isActive);
  if (active.length === 0) return null;
  return (
    <section aria-labelledby="schedule-windows-title" className="rounded-panel border border-border-soft bg-card p-5 shadow-elev-1">
      <h2 id="schedule-windows-title" className="text-lg font-bold">{t('windowsTitle')}</h2>
      <ul className="mt-3 grid gap-4 lg:grid-cols-2">
        {active.map((schedule) => (
          <ScheduleLine
            key={schedule.id}
            schedule={schedule}
            roomName={schedule.roomId === undefined ? undefined : rooms.get(schedule.roomId)}
            serviceName={schedule.serviceId === undefined ? undefined : services.get(schedule.serviceId)}
          />
        ))}
      </ul>
    </section>
  );
}
