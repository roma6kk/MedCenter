'use client';

import type { ReactNode } from 'react';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { DefinitionList, DefinitionRow } from '@/components/patient/definition-list';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import type { AppointmentView } from './appointment-types';

/** Every field of one appointment (API 6.3) as a term list; the optional ones appear only when the server sent them. */
export function AppointmentDetails({ appointment }: { readonly appointment: AppointmentView }): ReactNode {
  const t = useT('appointments');
  const format = useClinicFormat();
  return (
    <DefinitionList>
      <DefinitionRow label={t('fieldTime')}>
        <time dateTime={appointment.start} className="serif text-[20px] font-semibold">{format.dateTime(appointment.start)}</time>
        <span> – <time dateTime={appointment.end}>{format.time(appointment.end)}</time></span>
      </DefinitionRow>
      <DefinitionRow label={t('fieldStatus')}><StampBadge status={appointment.status} /></DefinitionRow>
      <DefinitionRow label={t('fieldDoctor')}>{appointment.doctorName ?? t('doctorUnknown')}</DefinitionRow>
      <DefinitionRow label={t('fieldService')}>{appointment.serviceName ?? t('serviceUnknown')}</DefinitionRow>
      {appointment.reason ? <DefinitionRow label={t('fieldReason')}>{appointment.reason}</DefinitionRow> : null}
      {appointment.status === 'cancelled' && appointment.cancelReason ? <DefinitionRow label={t('fieldCancelReason')}>{appointment.cancelReason}</DefinitionRow> : null}
      <DefinitionRow label={t('fieldCreated')}>{format.date(appointment.createdAt)}</DefinitionRow>
    </DefinitionList>
  );
}
