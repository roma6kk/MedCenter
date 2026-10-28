'use client';

import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryLoading } from '@/components/catalog/query-loading';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useDoctors, useService } from '@/components/catalog/use-catalog';
import type { Doctor, Slot } from '@/components/catalog/catalog-types';
import { EmptyState } from '@/components/feedback/states';
import { queryKeys } from '@/lib/api/query-keys';
import { useT } from '@/lib/i18n/use-t';
import { DoctorOption } from './doctor-option';
import { useStableCallback } from './use-stable-callback';

interface DoctorStepProps {
  readonly serviceId: string | null;
  readonly selectedDoctorId: string | null;
  readonly onSelect: (doctorId: string) => void;
  readonly onSelectSlot: (doctorId: string, slot: Slot) => void;
}

interface DoctorListProps extends DoctorStepProps {
  readonly doctors: ReadonlyArray<Doctor>;
  readonly durationMin: number | null;
}

function DoctorList({ serviceId, doctors, durationMin, selectedDoctorId, onSelect, onSelectSlot }: DoctorListProps): ReactNode {
  const t = useT('booking');
  // A service nobody gives is a different message from a clinic without any doctor: only the first one can be fixed here.
  if (doctors.length === 0 && serviceId === null) return <EmptyState title={t('doctorEmptyAll')} description={t('doctorEmptyAllHint')} />;
  if (doctors.length === 0) return <EmptyState title={t('doctorEmpty')} description={t('doctorEmptyHint')} />;
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {doctors.map((doctor) => (
        <li key={doctor.id}>
          <DoctorOption doctor={doctor} selected={doctor.id === selectedDoctorId} durationMin={durationMin} onSelect={onSelect} onSelectSlot={onSelectSlot} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Step 2: the doctors that give the chosen service (all doctors when no service was chosen). One doctor needs no choice:
 * he is taken at once and the wizard moves on to the time (a doctor who is already in the draft is left alone, so the
 * visitor who came back to this step by the stepper is not pushed forward again).
 */
export function DoctorStep({ serviceId, selectedDoctorId, onSelect, onSelectSlot }: DoctorStepProps): ReactNode {
  const t = useT('booking');
  const service = useService(serviceId);
  const query = useDoctors(serviceId === null ? {} : { serviceId });
  const doctors: ReadonlyArray<Doctor> | undefined = query.data?.items;
  const onlyDoctor: Doctor | undefined = doctors?.length === 1 && selectedDoctorId === null ? doctors[0] : undefined;
  const client = useQueryClient();
  /** The summary names the doctor from his own entry; the list already holds it, so the next step does not wait for another read. */
  const remember = (doctorId: string): void => {
    const known: Doctor | undefined = doctors?.find((doctor) => doctor.id === doctorId);
    if (known !== undefined) client.setQueryData(queryKeys.doctor(doctorId), known);
  };
  const select = useStableCallback(onSelect);
  const onlyDoctorId: string | undefined = onlyDoctor?.id;
  useEffect(() => {
    if (onlyDoctorId !== undefined) select(onlyDoctorId);
  }, [onlyDoctorId, select]);
  const heading: string = service.data === undefined ? t('doctorTitle') : t('doctorForService', { service: service.data.name });
  const waitingForService: boolean = serviceId !== null && service.isPending;
  return (
    <div>
      <h2 className="text-xl font-bold">{heading}</h2>
      <div className="mt-4">
        {doctors === undefined ? (
          <QueryFailure query={query} embedded pending={<QueryLoading />} />
        ) : waitingForService || onlyDoctor !== undefined ? (
          <QueryLoading />
        ) : (
          <DoctorList
            serviceId={serviceId}
            doctors={doctors}
            durationMin={service.data?.defaultDurationMin ?? null}
            selectedDoctorId={selectedDoctorId}
            onSelect={(doctorId) => {
              remember(doctorId);
              onSelect(doctorId);
            }}
            onSelectSlot={(doctorId, slot) => {
              remember(doctorId);
              onSelectSlot(doctorId, slot);
            }}
          />
        )}
      </div>
    </div>
  );
}
