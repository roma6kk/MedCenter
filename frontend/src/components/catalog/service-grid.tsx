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
      className="flex h-full min-h-[44px] flex-col gap-1 rounded-card border border-border bg-background p-5 transition-colors hover:border-primary hover:bg-card"
    >
      <span className="text-[17px] font-semibold">{service.name}</span>
      {service.description === undefined ? null : <span className="text-sm text-muted-foreground">{service.description}</span>}
      <span className="mono mt-auto self-start rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">{t('minutes', { minutes: service.defaultDurationMin })}</span>
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
