'use client';

import type { ReactNode } from 'react';
import { DoctorCard } from '@/components/catalog/doctor-card';
import { QueryLoading } from '@/components/catalog/query-loading';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useDoctors, useService } from '@/components/catalog/use-catalog';
import type { Doctor } from '@/components/catalog/catalog-types';
import { EmptyState } from '@/components/feedback/states';
import { useT } from '@/lib/i18n/use-t';

interface DoctorStepProps {
  readonly serviceId: string | null;
  readonly selectedDoctorId: string | null;
  readonly onSelect: (doctorId: string) => void;
}

function DoctorList({ doctors, selectedDoctorId, onSelect }: Omit<DoctorStepProps, 'serviceId'> & { readonly doctors: ReadonlyArray<Doctor> }): ReactNode {
  const t = useT('booking');
  if (doctors.length === 0) return <EmptyState title={t('doctorEmpty')} description={t('doctorEmptyHint')} />;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {doctors.map((doctor) => (
        <li key={doctor.id}>
          <DoctorCard doctor={doctor} headingLevel={3}>
            <button
              type="button"
              aria-pressed={doctor.id === selectedDoctorId}
              aria-label={`${t('chooseDoctor')}: ${doctor.name}`}
              onClick={() => onSelect(doctor.id)}
              data-testid={`doctor-${doctor.id}`}
              className="min-h-[44px] rounded-[6px] bg-[var(--primary)] px-4 py-2 text-sm text-[var(--primary-foreground)]"
            >
              {t('chooseDoctor')}
            </button>
          </DoctorCard>
        </li>
      ))}
    </ul>
  );
}

/** Step 2: the doctors that give the chosen service (all doctors when no service was chosen). */
export function DoctorStep({ serviceId, selectedDoctorId, onSelect }: DoctorStepProps): ReactNode {
  const t = useT('booking');
  const service = useService(serviceId);
  const query = useDoctors(serviceId === null ? {} : { serviceId });
  const heading: string = service.data === undefined ? t('doctorTitle') : t('doctorForService', { service: service.data.name });
  return (
    <div>
      <h2 className="serif text-xl font-semibold">{heading}</h2>
      <div className="mt-4">
        {query.data === undefined ? (
          <QueryFailure query={query} embedded pending={<QueryLoading />} />
        ) : (
          <DoctorList doctors={query.data.items} selectedDoctorId={selectedDoctorId} onSelect={onSelect} />
        )}
      </div>
    </div>
  );
}
