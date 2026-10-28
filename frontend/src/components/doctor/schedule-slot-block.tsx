'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Ban } from 'lucide-react';
import { formatClinicTime } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import type { AppointmentState } from './doctor-types';
import { canOpenPatientCard, shortName } from './journal-model';
import type { CalendarCell } from './schedule-week-model';

/** The tone of a visit in the calendar: the same three states as the journal's week grid, as a tinted fill with a bar on its left edge. */
const VISIT_TONE: Readonly<Record<Exclude<AppointmentState, 'cancelled'>, string>> = {
  booked: 'border-primary bg-primary-soft text-primary-soft-foreground',
  fulfilled: 'border-success bg-success-soft text-success',
  noshow: 'border-warning bg-warning-soft text-warning',
};

interface SlotBlockProps {
  readonly cell: CalendarCell;
  /** `grid`: a short block of the week table; `list`: a wide row of the day list (the phone), with the service under the name. */
  readonly layout: 'grid' | 'list';
}

/**
 * One slot of the doctor's calendar. A free slot is a quiet tile (the background of the day, A10); a busy one is a filled
 * block with the patient's name that opens the patient card; a busy one the journal does not list says only «Занято».
 */
export function SlotBlock({ cell, layout }: SlotBlockProps): ReactNode {
  const t = useT('doctor.schedule');
  const tStamp = useT('stamp');
  const { slot, visit } = cell;
  const time: string = `${formatClinicTime(slot.start)}–${formatClinicTime(slot.end)}`;
  const isList: boolean = layout === 'list';
  const sizing: string = isList ? 'min-h-[44px] px-3 py-2 text-sm' : 'h-11 px-2 text-xs';

  if (slot.status === 'free') {
    return (
      <span title={`${time} · ${tStamp('free')}`} className={cn('flex items-center rounded-control bg-secondary text-muted-foreground', sizing, !isList && 'justify-center')}>
        {isList ? t('free') : <span className="sr-only">{`${time}, ${tStamp('free')}`}</span>}
      </span>
    );
  }
  if (visit === undefined || visit.status === 'cancelled') {
    return (
      <span title={`${time} · ${tStamp('busy')}`} className={cn('flex items-center gap-1.5 rounded-control border border-border bg-card font-semibold text-muted-foreground', sizing)}>
        <Ban aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{t('busy')}</span>
        <span className="sr-only">{time}</span>
      </span>
    );
  }
  const name: string = visit.patientName ?? t('unknownPatient');
  const label: string = `${time} ${name}, ${tStamp(visit.status)}`;
  const className: string = cn('flex flex-col justify-center overflow-hidden rounded-control border-l-4 font-semibold no-underline', sizing, VISIT_TONE[visit.status]);
  const content: ReactNode = (
    <>
      <span className="truncate">{visit.patientName === undefined ? name : isList ? name : shortName(name)}</span>
      {isList ? (
        <span className="truncate text-xs font-normal">
          <span className="tabular-nums">{time}</span>
          {visit.serviceName ? ` · ${visit.serviceName}` : ''} · {tStamp(visit.status)}
        </span>
      ) : null}
    </>
  );
  return canOpenPatientCard(visit.status) ? (
    <Link href={`/patients/${encodeURIComponent(visit.patientId)}`} aria-label={`${label}. ${t('patientCard')}`} title={`${name} · ${time} · ${tStamp(visit.status)}`} className={cn(className, 'transition-[box-shadow] duration-fast ease-out hover:shadow-elev-2')}>
      {content}
    </Link>
  ) : (
    <span role="group" aria-label={label} title={`${name} · ${time} · ${tStamp(visit.status)}`} className={className}>
      {content}
    </span>
  );
}
