'use client';

import type { ReactNode } from 'react';
import { CalendarClock } from 'lucide-react';
import { describeWhen } from '@/components/booking/slot-when';
import { useNearestSlots } from '@/components/booking/use-nearest-slots';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import type { Doctor } from './catalog-types';
import { doctorLabel } from '@/lib/doctor-name';
import { doctorInitials } from './doctor-initials';

interface DoctorCardProps {
  readonly doctor: Doctor;
  readonly headingLevel?: 1 | 2 | 3;
  readonly tone?: 'static' | 'interactive' | 'selected';
  readonly showNearest?: boolean;
  readonly children?: ReactNode;
}

function NearestLine({ doctorId }: { readonly doctorId: string }): ReactNode {
  const t = useT('booking');
  const locale = useUiStore((state) => state.locale);
  const { today, slots, isPending } = useNearestSlots(doctorId, null);
  if (isPending) return <Skeleton aria-hidden="true" className="mt-2 h-5 w-44" />;
  const first = slots[0];
  return (
    <p data-testid="doctor-nearest" className="mt-2 flex items-center gap-1.5 text-sm font-medium">
      <CalendarClock aria-hidden="true" className="h-4 w-4 flex-none text-primary" />
      {first === undefined ? <span className="font-normal text-muted-foreground">{t('noNearest')}</span> : t('nearest', { when: describeWhen(first.start, today, locale, t) })}
    </p>
  );
}

export function DoctorCard({ doctor, headingLevel = 2, tone, showNearest = false, children }: DoctorCardProps): ReactNode {
  const t = useT('catalog');
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  return (
    <Card as="article" tone={tone} padding="none" data-testid="doctor-card" className="flex h-full gap-5 p-5">
      <Avatar src={doctor.photoUrl} initials={doctorInitials(doctor)} className="h-24 w-24 text-3xl" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Heading className="text-lg font-bold">{doctorLabel(doctor)}</Heading>
        <p className="text-base font-medium text-primary-soft-foreground">{doctor.specialty ?? t('noSpecialty')}</p>
        {showNearest ? <NearestLine doctorId={doctor.id} /> : null}
        {children === undefined ? null : <div className="mt-auto flex flex-wrap gap-2 pt-4">{children}</div>}
      </div>
    </Card>
  );
}
