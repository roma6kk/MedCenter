'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pager } from '@/components/data-display/paginated-table';
import { SectionTitle } from '@/components/feedback/section-title';
import { TableSkeleton } from '@/components/feedback/states';
import { useT } from '@/lib/i18n/use-t';
import { ContactList } from './contact-list';
import type { RelatedPerson } from './doctor-types';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useRelatedPersons } from './use-doctor-queries';

function relationshipOf(person: RelatedPerson): string | undefined {
  return person.relationship.map((coding) => coding.display ?? coding.code).find((text) => text !== undefined && text !== '');
}

function PersonCard({ person }: { readonly person: RelatedPerson }): ReactNode {
  const t = useT('doctor.patient');
  const relationship: string | undefined = relationshipOf(person);
  return (
    <li className="rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
      <p className="font-semibold">{person.fullName || t('unnamed')}</p>
      {relationship ? <p className="text-[var(--muted-foreground)]">{relationship}</p> : null}
      {person.telecom.length > 0 ? <div className="mt-2"><ContactList telecom={person.telecom} /></div> : null}
    </li>
  );
}

/** Trusted persons of the patient (API 3.3, `RelatedPerson`). */
export function RelatedPersons({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.patient');
  const [page, setPage] = useState(1);
  const related = useRelatedPersons(patientId, page);
  return (
    <section aria-labelledby="related-title" className="mt-6">
      <div id="related-title"><SectionTitle>{t('relatedTitle')}</SectionTitle></div>
      <div className="mt-3" aria-busy={related.isFetching}>
        {related.data === undefined ? <QueryFailure query={related} embedded notFoundText={t('relatedUnavailable')} pending={<TableSkeleton />} /> : null}
        {related.data && related.data.items.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">{t('relatedEmpty')}</p> : null}
        {related.data && related.data.items.length > 0 ? (
          <>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{related.data.items.map((person) => <PersonCard key={person.id} person={person} />)}</ul>
            {related.data.meta.totalPages > 1 ? <Pager meta={related.data.meta} onPage={setPage} /> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
