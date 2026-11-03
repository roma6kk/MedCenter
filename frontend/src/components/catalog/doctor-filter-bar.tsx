'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useT } from '@/lib/i18n/use-t';
import type { CatalogService } from './catalog-types';
import { directoryHref, type DirectoryParams, type SpecialtyOption } from './doctor-directory';
import { SECONDARY_BUTTON_CLASS } from './catalog-styles';
import { FIELD_CLASS } from '@/components/ui/field-styles';
import { Select } from '@/components/ui/select';

/** Pause after the last keystroke before the name filter is applied. */
export const SEARCH_DEBOUNCE_MS = 300;

interface DoctorFilterBarProps {
  readonly params: DirectoryParams;
  readonly services: ReadonlyArray<CatalogService>;
  readonly specialties: ReadonlyArray<SpecialtyOption>;
}

function Field({ label, htmlFor, children }: { readonly label: string; readonly htmlFor: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="form-label">{label}</label>
      {children}
    </div>
  );
}

/** The filters of `params` with one of them replaced (blank = removed); any change goes back to the first page. */
function withFilter(params: DirectoryParams, name: 'serviceId' | 'specialty' | 'search', value: string): DirectoryParams {
  const filters: Record<'serviceId' | 'specialty' | 'search', string | undefined> = { serviceId: params.serviceId, specialty: params.specialty, search: params.search };
  filters[name] = value === '' ? undefined : value;
  return {
    ...(filters.serviceId === undefined ? {} : { serviceId: filters.serviceId }),
    ...(filters.specialty === undefined ? {} : { specialty: filters.specialty }),
    ...(filters.search === undefined ? {} : { search: filters.search }),
    page: 1,
  };
}

/**
 * Service, specialty and name filters of the catalog (C5). They apply at once: a select on change, the name 300 ms after
 * the last keystroke, each as a `router.replace` to the URL the server renders from (no history entry per keystroke).
 * It stays a `<form method="get">` underneath, so without client JS Enter still submits the same URL.
 */
export function DoctorFilterBar({ params, services, specialties }: DoctorFilterBarProps): ReactNode {
  const t = useT('catalog');
  const id: string = useId();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [term, setTerm] = useState<string>(params.search ?? '');
  const latest = useRef<DirectoryParams>(params);
  latest.current = params;
  // The name this field last put into the URL, or found there. The page for it arrives after a server round trip, long after
  // the visitor may have typed on: that answer is the field's own navigation catching up, not a change from outside.
  const pushed = useRef<string | undefined>(params.search);
  const apply = (next: DirectoryParams): void => {
    pushed.current = next.search;
    startTransition(() => router.replace(directoryHref(next), { scroll: false }));
  };
  // Debounced name filter. A term that already is what the field pushed (the effect also runs after the URL caught up) changes nothing.
  useEffect(() => {
    const wanted: string = term.trim();
    if (wanted === (pushed.current ?? '')) return undefined;
    const timer = setTimeout(() => {
      const next: DirectoryParams = withFilter(latest.current, 'search', wanted);
      pushed.current = next.search;
      startTransition(() => router.replace(directoryHref(next), { scroll: false }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, router]);
  // The URL changed from outside (the reset link, back/forward): the field follows it.
  useEffect(() => {
    if (params.search === pushed.current) return;
    pushed.current = params.search;
    setTerm(params.search ?? '');
  }, [params.search]);
  const hasFilter: boolean = params.serviceId !== undefined || params.specialty !== undefined || params.search !== undefined || term !== '';
  return (
    <form
      method="get"
      action="/doctors"
      role="search"
      aria-label={t('filterLabel')}
      aria-busy={isPending}
      onSubmit={(event) => {
        event.preventDefault();
        apply(withFilter(latest.current, 'search', term.trim()));
      }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto] lg:items-end"
    >
      {services.length === 0 ? null : (
        <Field label={t('filterService')} htmlFor={`${id}-service`}>
          <Select id={`${id}-service`} name="serviceId" value={params.serviceId ?? ''} onChange={(event) => apply(withFilter(params, 'serviceId', event.target.value))}>
            <option value="">{t('anyService')}</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label={t('filterSpecialty')} htmlFor={`${id}-specialty`}>
        <Select id={`${id}-specialty`} name="specialty" value={params.specialty ?? ''} onChange={(event) => apply(withFilter(params, 'specialty', event.target.value))}>
          <option value="">{t('anySpecialty')}</option>
          {specialties.map((specialty) => <option key={specialty.code} value={specialty.code}>{specialty.label}</option>)}
        </Select>
      </Field>
      <Field label={t('filterSearch')} htmlFor={`${id}-search`}>
        <input id={`${id}-search`} type="search" name="search" maxLength={100} value={term} onChange={(event) => setTerm(event.target.value)} className={FIELD_CLASS} />
      </Field>
      {hasFilter ? <Link href="/doctors" className={SECONDARY_BUTTON_CLASS}>{t('reset')}</Link> : null}
      <p role="status" className="sr-only">{isPending ? t('updating') : ''}</p>
    </form>
  );
}
