'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/feedback/states';
import { useT } from '@/lib/i18n/use-t';
import type { CatalogService } from './catalog-types';

function ServiceCard({ service }: { readonly service: CatalogService }): ReactNode {
  const t = useT('catalog');
  return (
    <Link
      href={`/doctors?serviceId=${encodeURIComponent(service.id)}`}
      data-testid="service-card"
      className="flex h-full min-h-[44px] flex-col gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-4 hover:bg-[var(--secondary)]"
    >
      <span className="font-semibold">{service.name}</span>
      {service.description === undefined ? null : <span className="text-sm text-[var(--muted-foreground)]">{service.description}</span>}
      <span className="mono mt-auto pt-2 text-xs text-[var(--muted-foreground)]">{t('minutes', { minutes: service.defaultDurationMin })}</span>
    </Link>
  );
}

/** Services of the clinic; each leads to the doctors who give it. */
export function ServiceGrid({ services }: { readonly services: ReadonlyArray<CatalogService> }): ReactNode {
  const t = useT('home');
  if (services.length === 0) return <EmptyState title={t('servicesEmpty')} />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((service) => (
        <li key={service.id}><ServiceCard service={service} /></li>
      ))}
    </ul>
  );
}
