'use client';

import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useT } from '@/lib/i18n/use-t';
import { formatClinicDate } from '@/lib/clinic-time';
import { cn } from '@/lib/ui/cn';
import { MIN_QUERY_LENGTH, findPatients, type PatientHit } from './patient-search-model';
import { useDoctorPatients } from './use-doctor-queries';

interface DoctorPatientSearchProps {
  readonly onNavigate?: () => void;
}

const RESULT_CLASS =
  'flex min-h-[44px] flex-col justify-center rounded-control px-3 py-1.5 text-left text-sm outline-none transition-[background-color] duration-fast ease-out hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring';

function moveFocus(event: KeyboardEvent<HTMLElement>, input: HTMLInputElement | null, list: HTMLElement | null): void {
  const links: ReadonlyArray<HTMLElement> = list === null ? [] : Array.from(list.querySelectorAll<HTMLElement>('a'));
  const stops: ReadonlyArray<HTMLElement | null> = [input, ...links];
  const index: number = stops.findIndex((stop) => stop === document.activeElement);
  const step: number = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  if (step === 0 || index < 0) return;
  const next: HTMLElement | null | undefined = stops[index + step];
  if (next === undefined) return;
  event.preventDefault();
  next?.focus();
}

function Results({ hits, onOpen }: { readonly hits: ReadonlyArray<PatientHit>; readonly onOpen: () => void }): ReactNode {
  const t = useT('doctor.search');
  return (
    <ul className="flex flex-col gap-0.5">
      {hits.map((hit) => (
        <li key={hit.patientId}>
          <Link href={`/patients/${encodeURIComponent(hit.patientId)}`} onClick={onOpen} className={RESULT_CLASS}>
            <span className="font-semibold [overflow-wrap:anywhere]">{hit.name}</span>
            {hit.lastVisit === undefined ? null : (
              <span className="tabular-nums text-xs text-muted-foreground">{t('lastVisit', { date: formatClinicDate(hit.lastVisit) })}</span>
            )}
            {hit.nextVisit === undefined ? null : (
              <span className="tabular-nums text-xs text-muted-foreground">{t('nextVisit', { date: formatClinicDate(hit.nextVisit) })}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DoctorPatientSearch({ onNavigate }: DoctorPatientSearchProps): ReactNode {
  const t = useT('doctor.search');
  const tCommon = useT('common');
  const inputId: string = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const isActive: boolean = query.trim().length >= MIN_QUERY_LENGTH;
  const patients = useDoctorPatients(isActive);
  const hits: ReadonlyArray<PatientHit> = isActive ? findPatients(patients.data?.patients ?? [], query) : [];
  const open = (): void => {
    setQuery('');
    onNavigate?.();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && query !== '') {
      // The first Escape clears the field; only the next one may close a drawer around it.
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
      input.current?.focus();
      return;
    }
    moveFocus(event, input.current, list.current);
  };
  return (
    <div role="search" aria-label={t('label')} onKeyDown={onKeyDown} className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="sr-only">{t('label')}</label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={input}
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('placeholder')}
          autoComplete="off"
          maxLength={80}
          className={cn(
            'h-11 w-full rounded-control border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground',
            'transition-[border-color,box-shadow] duration-fast ease-out focus:border-primary focus:outline-none focus:shadow-focus',
          )}
        />
      </div>
      <div ref={list} role="status" aria-live="polite" className="empty:hidden">
        {!isActive ? null : patients.isPending ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">{t('searching')}</p>
        ) : patients.isError ? (
          <div className="flex flex-col items-start gap-1 px-3 py-2">
            <p className="text-sm text-destructive">{t('failed')}</p>
            <button
              type="button"
              disabled={patients.isFetching}
              onClick={() => void patients.refetch()}
              className="min-h-[44px] rounded-control px-2 text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {tCommon('retry')}
            </button>
          </div>
        ) : hits.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">{t('none')}</p>
        ) : (
          <Results hits={hits} onOpen={open} />
        )}
        {isActive && patients.data?.truncated === true ? <p className="px-3 py-1 text-xs text-muted-foreground">{t('truncated')}</p> : null}
      </div>
    </div>
  );
}
