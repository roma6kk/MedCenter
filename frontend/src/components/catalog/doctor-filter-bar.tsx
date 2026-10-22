'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useId } from 'react';
import { useT } from '@/lib/i18n/use-t';
import type { CatalogService } from './catalog-types';
import type { DirectoryParams, SpecialtyOption } from './doctor-directory';
import { SECONDARY_BUTTON_CLASS } from './catalog-styles';

const CONTROL_CLASS = 'mt-1 min-h-[44px] w-full rounded-[6px] border border-[var(--input)] bg-[var(--card)] px-2';

interface DoctorFilterBarProps {
  readonly params: DirectoryParams;
  readonly services: ReadonlyArray<CatalogService>;
  readonly specialties: ReadonlyArray<SpecialtyOption>;
}

function Field({ label, htmlFor, children }: { readonly label: string; readonly htmlFor: string; readonly children: ReactNode }): ReactNode {
  return (
    <div>
      <label htmlFor={htmlFor} className="form-label block">{label}</label>
      {children}
    </div>
  );
}

/** Service, specialty and name filters of the catalog: a plain GET form, so the filters are links and work without client JS. */
export function DoctorFilterBar({ params, services, specialties }: DoctorFilterBarProps): ReactNode {
  const t = useT('catalog');
  const id: string = useId();
  return (
    <form method="get" action="/doctors" role="search" aria-label={t('filterLabel')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      {services.length === 0 ? null : (
        <Field label={t('filterService')} htmlFor={`${id}-service`}>
          <select id={`${id}-service`} name="serviceId" defaultValue={params.serviceId ?? ''} className={CONTROL_CLASS}>
            <option value="">{t('anyService')}</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </Field>
      )}
      <Field label={t('filterSpecialty')} htmlFor={`${id}-specialty`}>
        <select id={`${id}-specialty`} name="specialty" defaultValue={params.specialty ?? ''} className={CONTROL_CLASS}>
          <option value="">{t('anySpecialty')}</option>
          {specialties.map((specialty) => <option key={specialty.code} value={specialty.code}>{specialty.label}</option>)}
        </select>
      </Field>
      <Field label={t('filterSearch')} htmlFor={`${id}-search`}>
        <input id={`${id}-search`} type="search" name="search" maxLength={100} defaultValue={params.search ?? ''} className={CONTROL_CLASS} />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className="min-h-[44px] rounded-[6px] bg-[var(--primary)] px-5 py-2 text-[var(--primary-foreground)]">{t('apply')}</button>
        <Link href="/doctors" className={SECONDARY_BUTTON_CLASS}>{t('reset')}</Link>
      </div>
    </form>
  );
}
