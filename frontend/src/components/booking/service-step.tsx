'use client';

import type { ReactNode } from 'react';
import { QueryLoading } from '@/components/catalog/query-loading';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useServices } from '@/components/catalog/use-catalog';
import type { CatalogService } from '@/components/catalog/catalog-types';
import { EmptyState } from '@/components/feedback/states';
import { useT } from '@/lib/i18n/use-t';

const CARD_CLASS = 'flex min-h-[44px] w-full flex-col gap-1 rounded-[8px] border p-4 text-left hover:bg-[var(--secondary)]';

interface ServiceStepProps {
  readonly selectedServiceId: string | null;
  /** `null` = "I don't know which service I need": every doctor is offered. */
  readonly onSelect: (serviceId: string | null) => void;
}

function ServiceChoice({ service, selected, onSelect }: { readonly service: CatalogService; readonly selected: boolean; readonly onSelect: () => void }): ReactNode {
  const t = useT('booking');
  const border: string = selected ? 'border-[var(--primary)] border-[1.5px]' : 'border-[var(--border)]';
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} data-testid={`service-${service.id}`} className={`${CARD_CLASS} ${border} bg-[var(--card)]`}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{service.name}</span>
        <span className="mono text-xs text-[var(--muted-foreground)]">{t('serviceMinutes', { minutes: service.defaultDurationMin })}</span>
      </span>
      {service.description === undefined ? null : <span className="text-sm text-[var(--muted-foreground)]">{service.description}</span>}
    </button>
  );
}

function AnyServiceChoice({ onSelect }: { readonly onSelect: () => void }): ReactNode {
  const t = useT('booking');
  return (
    <button type="button" onClick={onSelect} data-testid="service-any" className={`${CARD_CLASS} border-dashed border-[var(--border)]`}>
      <span className="font-semibold">{t('anyService')}</span>
      <span className="text-sm text-[var(--muted-foreground)]">{t('anyServiceHint')}</span>
    </button>
  );
}

function ServiceList({ services, selectedServiceId, onSelect }: ServiceStepProps & { readonly services: ReadonlyArray<CatalogService> }): ReactNode {
  const t = useT('booking');
  if (services.length === 0) return <EmptyState title={t('servicesEmpty')} action={<AnyServiceChoice onSelect={() => onSelect(null)} />} />;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {services.map((service) => (
        <li key={service.id}>
          <ServiceChoice service={service} selected={service.id === selectedServiceId} onSelect={() => onSelect(service.id)} />
        </li>
      ))}
      <li><AnyServiceChoice onSelect={() => onSelect(null)} /></li>
    </ul>
  );
}

/** Step 1: the service decides the doctors offered next and the length of the visit. */
export function ServiceStep({ selectedServiceId, onSelect }: ServiceStepProps): ReactNode {
  const t = useT('booking');
  const query = useServices();
  return (
    <div>
      <h2 className="serif text-xl font-semibold">{t('serviceTitle')}</h2>
      <p className="mb-4 mt-1 text-sm text-[var(--muted-foreground)]">{t('serviceLead')}</p>
      {query.data === undefined ? (
        <QueryFailure query={query} embedded pending={<QueryLoading />} />
      ) : (
        <ServiceList services={query.data.items} selectedServiceId={selectedServiceId} onSelect={onSelect} />
      )}
    </div>
  );
}
