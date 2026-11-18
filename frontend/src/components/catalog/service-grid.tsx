'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/feedback/states';
import { cardVariants } from '@/components/ui/card-variants';
import { cn } from '@/lib/ui/cn';
import { useT } from '@/lib/i18n/use-t';
import type { CatalogService } from './catalog-types';

function ServiceCard({ service }: { readonly service: CatalogService }): ReactNode {
  const t = useT('catalog');
  return (
    <Link
      href={`/doctors?serviceId=${encodeURIComponent(service.id)}`}
      data-testid="service-card"
      className={cn(cardVariants({ tone: 'interactive' }), 'flex h-full min-h-[44px] flex-col gap-1')}
    >
      <span className="text-lg font-semibold">{service.name}</span>
      {service.description === undefined ? null : <span className="text-sm text-muted-foreground">{service.description}</span>}
      <span className="tabular-nums mt-auto self-start rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">{t('minutes', { minutes: service.defaultDurationMin })}</span>
    </Link>
  );
}

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
