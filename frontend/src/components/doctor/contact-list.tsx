'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import type { Telecom } from './doctor-types';

/** `tel:` / `mailto:` for phone and e-mail, plain text for the rest (fax, pager, url). Values come from the API: never trusted as markup. */
function hrefOf(contact: Telecom): string | undefined {
  if (contact.system === 'phone') return `tel:${contact.value.replace(/[^\d+]/g, '')}`;
  if (contact.system === 'email') return `mailto:${contact.value}`;
  return undefined;
}

export function ContactList({ telecom }: { readonly telecom: ReadonlyArray<Telecom> }): ReactNode {
  const t = useT('doctor.patient.telecom');
  return (
    <ul className="grid gap-1">
      {telecom.map((contact, index) => {
        const href: string | undefined = hrefOf(contact);
        return (
          <li key={`${contact.system}-${contact.value}-${index}`}>
            <span className="text-muted-foreground">{t(contact.system)}: </span>
            {href ? <a href={href} className="underline">{contact.value}</a> : <span>{contact.value}</span>}
          </li>
        );
      })}
    </ul>
  );
}
