'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/feedback/states';
import { useT } from '@/lib/i18n/use-t';
import { CatalogUnavailable } from './catalog-unavailable';
import type { CatalogService, Doctor } from './catalog-types';
import { directoryHref, type Directory, type DirectoryParams } from './doctor-directory';
import { DoctorCard } from './doctor-card';
import { DoctorFilterBar } from './doctor-filter-bar';
import { DoctorPager } from './doctor-pager';
import { DoctorProfileLink } from './doctor-profile-link';

interface DoctorCatalogProps {
  readonly params: DirectoryParams;
  readonly services: ReadonlyArray<CatalogService>;
  /** `null` when the doctors could not be read on the server. */
  readonly directory: Directory | null;
}

function DoctorGrid({ doctors }: { readonly doctors: ReadonlyArray<Doctor> }): ReactNode {
  return (
    <ul className="mt-4 grid gap-3 md:grid-cols-2" data-testid="doctor-list">
      {doctors.map((doctor) => (
        <li key={doctor.id}><DoctorCard doctor={doctor}><DoctorProfileLink doctor={doctor} /></DoctorCard></li>
      ))}
    </ul>
  );
}

function DoctorResults({ directory, params }: { readonly directory: Directory; readonly params: DirectoryParams }): ReactNode {
  const t = useT('catalog');
  const { items, meta } = directory.page;
  if (items.length === 0) {
    return <EmptyState title={t('empty')} description={t('emptyHint')} action={<Link href={directoryHref({ page: 1 })} className="underline">{t('reset')}</Link>} />;
  }
  return (
    <>
      <p role="status" className="mt-4 text-sm text-[var(--muted-foreground)]">{t('found', { count: meta.totalItems })}</p>
      <DoctorGrid doctors={items} />
      <DoctorPager meta={meta} params={params} />
    </>
  );
}

/** `/doctors`: the catalog with filters by service, specialty and name, server-side pagination (frontend-design-spec §3). */
export function DoctorCatalog({ params, services, directory }: DoctorCatalogProps): ReactNode {
  const t = useT('catalog');
  return (
    <div>
      <h1 className="serif text-[32px] font-bold leading-tight">{t('doctorsTitle')}</h1>
      <p className="mt-2 text-[var(--muted-foreground)]">{t('doctorsLead')}</p>
      <div className="mt-6"><DoctorFilterBar params={params} services={services} specialties={directory?.specialties ?? []} /></div>
      {directory === null ? (
        <div className="mt-6"><CatalogUnavailable namespace="catalog" retryHref={directoryHref(params)} /></div>
      ) : (
        <DoctorResults directory={directory} params={params} />
      )}
    </div>
  );
}
