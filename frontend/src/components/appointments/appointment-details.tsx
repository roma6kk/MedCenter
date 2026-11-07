'use client';

import type { ReactNode } from 'react';
import { DefinitionList, DefinitionRow } from '@/components/patient/definition-list';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { isDateKey } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { doctorOf, type AppointmentView } from './appointment-types';
import { StampBadge } from '@/components/feedback/stamp-badge';

export function AppointmentDetails({ appointment }: { readonly appointment: AppointmentView }): ReactNode {
  const t = useT('appointments');
  const format = useClinicFormat();
  return (
    <DefinitionList>
      <DefinitionRow label={t('fieldTime')}>
        <time dateTime={appointment.start} className="text-lg font-bold">{format.dateTime(appointment.start)}</time>
        <span> – <time dateTime={appointment.end}>{format.time(appointment.end)}</time></span>
      </DefinitionRow>
      <DefinitionRow label={t('fieldStatus')}><StampBadge status={appointment.status} /></DefinitionRow>
      <DefinitionRow label={t('fieldDoctor')}>{doctorOf(appointment, t('doctorUnknown'))}</DefinitionRow>
      <DefinitionRow label={t('fieldService')}>{appointment.serviceName ?? t('serviceUnknown')}</DefinitionRow>
      {appointment.reason ? <DefinitionRow label={t('fieldReason')}>{appointment.reason}</DefinitionRow> : null}
      {appointment.status === 'cancelled' && appointment.cancelReason ? <DefinitionRow label={t('fieldCancelReason')}>{appointment.cancelReason}</DefinitionRow> : null}
      <DefinitionRow label={t('fieldCreated')}>{isDateKey(appointment.createdAt) ? format.date(appointment.createdAt) : format.dateTime(appointment.createdAt)}</DefinitionRow>
    </DefinitionList>
  );
}
