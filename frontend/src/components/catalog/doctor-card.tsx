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
import { doctorInitials } from './doctor-initials';

interface DoctorCardProps {
  readonly doctor: Doctor;
  /** Heading level of the name inside the page outline. */
  readonly headingLevel?: 1 | 2 | 3;
  /** `interactive` when the card as a whole leads somewhere (give its link `STRETCHED_LINK_CLASS`), `selected` for the chosen doctor of a list. */
  readonly tone?: 'static' | 'interactive' | 'selected';
  /** Adds «Ближайшее: …» under the specialty (reads the doctor's slots, so the card must sit under the query provider). */
  readonly showNearest?: boolean;
  /** Links or buttons shown under the specialty. */
  readonly children?: ReactNode;
}

/** «Ближайшее: завтра, 09:00» from the doctor's earliest free slot; the same two-week answer the booking wizard reads. */
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

/** Doctor of the catalog: a 96 px portrait (initials on a soft teal tile without one), name, specialty and the nearest free time (frontend-design-spec §C.1, VB4). */
export function DoctorCard({ doctor, headingLevel = 2, tone, showNearest = false, children }: DoctorCardProps): ReactNode {
  const t = useT('catalog');
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  return (
    <Card as="article" tone={tone} padding="none" data-testid="doctor-card" className="flex h-full gap-5 p-5">
      <Avatar src={doctor.photoUrl} initials={doctorInitials(doctor)} className="h-24 w-24 text-3xl" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Heading className="text-lg font-bold">{doctor.name}</Heading>
        <p className="text-base font-medium text-primary-soft-foreground">{doctor.specialty ?? t('noSpecialty')}</p>
        {showNearest ? <NearestLine doctorId={doctor.id} /> : null}
        {children === undefined ? null : <div className="mt-auto flex flex-wrap gap-2 pt-4">{children}</div>}
      </div>
    </Card>
  );
}
