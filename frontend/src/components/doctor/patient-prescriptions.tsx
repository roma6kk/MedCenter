'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pager } from '@/components/data-display/paginated-table';
import { CodeChip } from '@/components/feedback/code-chip';
import { SectionTitle } from '@/components/feedback/section-title';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { useStaggerOnce } from '@/hooks/use-stagger-once';
import { useT } from '@/lib/i18n/use-t';
import { formatClinicDate } from '@/lib/clinic-time';
import { cn } from '@/lib/ui/cn';
import type { Prescription } from './doctor-types';
import { ATC_SYSTEM } from './encounter-problem-fields';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { usePatientPrescriptions } from './use-doctor-queries';

/** `ServiceRequest` and `MedicationRequest` share one list (API 7.5): the `kind` decides what the card shows. */
function PrescriptionBody({ item }: { readonly item: Prescription }): ReactNode {
  const t = useT('doctor.prescriptions');
  if (item.kind === 'medication') {
    return (
      <>
        <p className="form-label">{t('medication')}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-2 text-sm">
          <CodeChip code={item.atcCode} system={ATC_SYSTEM} />
          {item.atcDisplay ? <span className="font-semibold">{item.atcDisplay}</span> : null}
        </p>
        <p className="mt-2 text-sm">{item.dosageText}</p>
      </>
    );
  }
  return (
    <>
      <p className="form-label">{t('service')}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-2 text-sm">
        <CodeChip code={item.code} system={item.codeSystem} />
        {item.display ? <span className="font-semibold">{item.display}</span> : null}
      </p>
    </>
  );
}

/** What the order is called: the drug or service name, its code while the name is unknown. */
function orderName(item: Prescription): string {
  return item.kind === 'medication' ? item.atcDisplay ?? item.atcCode : item.display ?? item.code;
}

function PrescriptionCard({ item }: { readonly item: Prescription }): ReactNode {
  const t = useT('doctor.prescriptions');
  return (
    <li>
      <article className="h-full rounded-card border border-border bg-card p-3">
        <PrescriptionBody item={item} />
        {item.note ? <p className="mt-2 text-sm text-muted-foreground">{item.note}</p> : null}
        <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{item.authoredOn ? formatClinicDate(item.authoredOn) : null}</span>
          {item.encounterId ? <Link href={`/encounters/${encodeURIComponent(item.encounterId)}`} aria-label={t('openEncounterOn', { name: orderName(item) })} className="underline">{t('openEncounter')}</Link> : null}
        </p>
      </article>
    </li>
  );
}

/** The patient's whole prescription list (API 7.5): drugs by ATC code and ordered services, in one list; the summary beside it shows what is in force. */
export function PatientPrescriptions({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.prescriptions');
  const [page, setPage] = useState(1);
  const prescriptions = usePatientPrescriptions(patientId, page);
  const enter = useStaggerOnce(prescriptions.data !== undefined);
  // A patient who has never been prescribed anything gets no section: the summary beside it already says so in one line (A2).
  if (page === 1 && prescriptions.data?.items.length === 0) return null;
  return (
    <section aria-labelledby="prescriptions-title">
      <div id="prescriptions-title"><SectionTitle>{t('title')}</SectionTitle></div>
      <div className="mt-3" aria-busy={prescriptions.isFetching}>
        {prescriptions.data === undefined ? <QueryFailure query={prescriptions} embedded notFoundText={t('unavailable')} pending={<ContentSkeleton shape="cards" rows={2} />} /> : null}
        {prescriptions.data && prescriptions.data.items.length > 0 ? (
          <>
            <ul className={cn('grid gap-3 sm:grid-cols-2', enter)}>{prescriptions.data.items.map((item) => <PrescriptionCard key={item.id} item={item} />)}</ul>
            {prescriptions.data.meta.totalPages > 1 ? <Pager meta={prescriptions.data.meta} onPage={setPage} /> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
