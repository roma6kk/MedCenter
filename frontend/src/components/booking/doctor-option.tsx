'use client';

import type { ReactNode } from 'react';
import { CalendarClock } from 'lucide-react';
import { doctorInitials } from '@/components/catalog/doctor-initials';
import type { Doctor, Slot } from '@/components/catalog/catalog-types';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { clinicDayOf, formatClinicTime } from '@/lib/clinic-time';
import { doctorLabel } from '@/lib/doctor-name';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { describeWhen } from './slot-when';
import { useNearestSlots } from './use-nearest-slots';

interface DoctorOptionProps {
  readonly doctor: Doctor;
  readonly selected: boolean;
  readonly durationMin: number | null;
  readonly serviceId?: string | null;
  readonly onSelect: (doctorId: string) => void;
  readonly onSelectSlot: (doctorId: string, slot: Slot) => void;
}

const CHIP_CLASS =
  'inline-flex min-h-[44px] items-center rounded-control border border-border bg-card px-3 text-sm font-semibold tabular-nums transition-[background-color,border-color] duration-fast ease-out hover:border-primary hover:bg-primary-soft';

function NearestTimes({ doctor, durationMin, serviceId = null, onSelectSlot }: Pick<DoctorOptionProps, 'doctor' | 'durationMin' | 'serviceId' | 'onSelectSlot'>): ReactNode {
  const t = useT('booking');
  const locale = useUiStore((state) => state.locale);
  const { today, slots, isPending } = useNearestSlots(doctor.id, durationMin, serviceId);
  if (isPending) return <Skeleton aria-hidden="true" className="h-11 w-full rounded-control" />;
  const first: Slot | undefined = slots[0];
  if (first === undefined) return <p className="text-sm text-muted-foreground">{t('noNearest')}</p>;
  const firstDay: string = clinicDayOf(first.start);
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <CalendarClock aria-hidden="true" size={16} className="flex-none text-primary" />
        {t('nearest', { when: describeWhen(first.start, today, locale, t) })}
      </p>
      <div role="group" aria-label={t('nearestSlots')}>
        <ul className="flex flex-wrap gap-2">
          {slots.map((slot) => {
            const day: string = clinicDayOf(slot.start);
            const when: string = describeWhen(slot.start, today, locale, t);
            return (
              <li key={slot.id}>
                <button
                  type="button"
                  data-testid={`nearest-${slot.id}`}
                  aria-label={t('bookNearest', { when, doctor: doctorLabel(doctor) })}
                  onClick={() => onSelectSlot(doctor.id, slot)}
                  className={CHIP_CLASS}
                >
                  {day === firstDay ? formatClinicTime(slot.start, locale) : when}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function DoctorOption({ doctor, selected, durationMin, serviceId = null, onSelect, onSelectSlot }: DoctorOptionProps): ReactNode {
  const t = useT('booking');
  const catalog = useT('catalog');
  return (
    <Card as="article" tone={selected ? 'selected' : 'static'} padding="none" data-testid="doctor-card" className="flex h-full gap-4 p-5">
      <Avatar src={doctor.photoUrl} initials={doctorInitials(doctor)} className="h-20 w-20 text-2xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <h3 className="text-lg font-bold">{doctorLabel(doctor)}</h3>
          <p className="text-sm text-muted-foreground">{doctor.specialty ?? catalog('noSpecialty')}</p>
        </div>
        <NearestTimes doctor={doctor} durationMin={durationMin} serviceId={serviceId} onSelectSlot={onSelectSlot} />
        <div className="mt-auto">
          <Button
            variant="soft"
            aria-pressed={selected}
            aria-label={`${t('chooseDoctor')}: ${doctorLabel(doctor)}`}
            onClick={() => onSelect(doctor.id)}
            data-testid={`doctor-${doctor.id}`}
          >
            {t('chooseDoctor')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
