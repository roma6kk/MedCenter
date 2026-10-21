'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { StampBadge } from '@/components/feedback/stamp-badge';
import type { TableColumn } from '@/components/data-display/paginated-table';
import { useT } from '@/lib/i18n/use-t';
import { formatClinicTime } from '@/lib/clinic-time';
import type { JournalAppointment } from './doctor-types';
import { NoshowButton } from './noshow-button';
import { OpenEncounterButton } from './open-encounter-button';

function PatientCell({ appointment }: { readonly appointment: JournalAppointment }): ReactNode {
  const t = useT('doctor.journal');
  const name: string = appointment.patientName ?? t('unknownPatient', { id: appointment.patientId });
  return (
    <Link href={`/patients/${encodeURIComponent(appointment.patientId)}`} className="underline" title={t('patientCard')} data-row-anchor>
      {name}
    </Link>
  );
}

/** Only a booked appointment can be opened or marked a no-show (BR-008); every other state shows a dash. */
function ActionsCell({ appointment }: { readonly appointment: JournalAppointment }): ReactNode {
  const t = useT('doctor.journal');
  if (appointment.status !== 'booked') return <span aria-hidden="true">—</span>;
  const name: string = appointment.patientName ?? t('unknownPatient', { id: appointment.patientId });
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <OpenEncounterButton appointmentId={appointment.id} patientId={appointment.patientId} label={`${name}, ${formatClinicTime(appointment.start)}`} />
      <NoshowButton appointmentId={appointment.id} patientName={name} />
    </span>
  );
}

/** Columns of the doctor's day table: time, patient, service, reason, status, actions. */
export function useJournalColumns(): ReadonlyArray<TableColumn<JournalAppointment>> {
  const t = useT('doctor.journal');
  return [
    { key: 'time', header: t('columns.time'), render: (row) => <span className="mono">{formatClinicTime(row.start)}</span> },
    { key: 'patient', header: t('columns.patient'), render: (row) => <PatientCell appointment={row} /> },
    { key: 'service', header: t('columns.service'), render: (row) => row.serviceName ?? '—' },
    { key: 'reason', header: t('columns.reason'), render: (row) => <span className="line-clamp-2 max-w-[24ch]">{row.reason ?? '—'}</span> },
    { key: 'status', header: t('columns.status'), render: (row) => <StampBadge status={row.status} /> },
    { key: 'actions', header: t('columns.actions'), render: (row) => <ActionsCell appointment={row} /> },
  ];
}
