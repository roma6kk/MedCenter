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
  /** Runs when a result is opened (the mobile drawer closes itself). */
  readonly onNavigate?: () => void;
}

const RESULT_CLASS =
  'flex min-h-[44px] flex-col justify-center rounded-control px-3 py-1.5 text-left text-sm outline-none transition-[background-color] duration-fast ease-out hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring';

/** Moves the focus along the result links with the arrow keys; the input is the first stop, so ArrowUp from the first result returns to it. */
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
            <span className="tabular-nums text-xs text-muted-foreground">{t('lastVisit', { date: formatClinicDate(hit.lastVisit) })}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * «Найти пациента» in the doctor's sidebar (A13). The doctor's side of the API has no patient search, so it searches the
 * patients of the doctor's own journal (the last three months and the next one); the hint under an empty result says so.
 * The read starts with the first typed letters, not with the page, so it costs the other screens nothing.
 */
export function DoctorPatientSearch({ onNavigate }: DoctorPatientSearchProps): ReactNode {
  const t = useT('doctor.search');
  const inputId: string = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const isActive: boolean = query.trim().length >= MIN_QUERY_LENGTH;
  const patients = useDoctorPatients(isActive);
  const hits: ReadonlyArray<PatientHit> = isActive ? findPatients(patients.data ?? [], query) : [];
  const open = (): void => {
    setQuery('');
    onNavigate?.();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && query !== '') {
      // The first Escape clears the field; only the next one may close a drawer this search sits in.
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
          <p className="px-3 py-2 text-sm text-destructive">{t('failed')}</p>
        ) : hits.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">{t('none')}</p>
        ) : (
          <Results hits={hits} onOpen={open} />
        )}
      </div>
    </div>
  );
}
