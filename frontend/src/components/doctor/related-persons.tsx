'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import type { RelatedPerson, Telecom } from './doctor-types';
import { useRelatedPersons } from './use-doctor-queries';

function relationshipOf(person: RelatedPerson): string | undefined {
  return person.relationship.map((coding) => coding.display ?? coding.code).find((text) => text !== undefined && text !== '');
}

function phoneOf(person: RelatedPerson): Telecom | undefined {
  return person.telecom.find((contact) => contact.system === 'phone');
}

function Person({ person }: { readonly person: RelatedPerson }): ReactNode {
  const t = useT('doctor.patient');
  const relationship: string | undefined = relationshipOf(person);
  const phone: Telecom | undefined = phoneOf(person);
  return (
    <li>
      <span className="font-medium">{person.fullName || t('unnamed')}</span>
      {relationship ? <span className="text-muted-foreground">{` (${relationship})`}</span> : null}
      {phone ? <>{' · '}<a href={`tel:${phone.value.replace(/[^\d+]/g, '')}`} className="underline">{phone.value}</a></> : null}
    </li>
  );
}

export function RelatedPersons({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('doctor.patient');
  const related = useRelatedPersons(patientId, 1);
  if (related.isError) return <p className="text-sm text-muted-foreground">{t('relatedUnavailable')}</p>;
  if (related.data === undefined || related.data.items.length === 0) return null;
  return (
    <section aria-label={t('relatedTitle')} className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <h2 className="form-label">{t('relatedTitle')}</h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">{related.data.items.map((person) => <Person key={person.id} person={person} />)}</ul>
    </section>
  );
}
