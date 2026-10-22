'use client';

import type { ReactNode } from 'react';
import { Check, CircleHelp } from 'lucide-react';
import { QueryLoading } from '@/components/catalog/query-loading';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useServices } from '@/components/catalog/use-catalog';
import type { CatalogService } from '@/components/catalog/catalog-types';
import { EmptyState } from '@/components/feedback/states';
import { cn } from '@/lib/ui/cn';
import { useT } from '@/lib/i18n/use-t';

const CARD_CLASS = 'flex min-h-[44px] w-full gap-3.5 rounded-card p-5 text-left transition-colors hover:bg-secondary';

interface ServiceStepProps {
  readonly selectedServiceId: string | null;
  /** `null` = "I don't know which service I need": every doctor is offered. */
  readonly onSelect: (serviceId: string | null) => void;
}

/** The check circle of the chosen card, or the empty "radio" ring of the others. */
function Marker({ selected }: { readonly selected: boolean }): ReactNode {
  return selected ? (
    <span aria-hidden="true" className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground">
      <Check size={14} strokeWidth={3} />
    </span>
  ) : (
    <span aria-hidden="true" className="h-6 w-6 flex-none rounded-full border-2 border-input" />
  );
}

function ServiceChoice({ service, selected, onSelect }: { readonly service: CatalogService; readonly selected: boolean; readonly onSelect: () => void }): ReactNode {
  const t = useT('booking');
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={`service-${service.id}`}
      className={cn(CARD_CLASS, 'border bg-card', selected ? 'border-2 border-primary shadow-[0_0_0_4px_var(--primary-soft)] hover:bg-card' : 'border-border')}
    >
      <Marker selected={selected} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-base font-semibold">{service.name}</span>
        {service.description === undefined ? null : <span className="text-sm text-muted-foreground">{service.description}</span>}
      </span>
      <span className={cn('mono h-fit flex-none rounded-full px-2.5 py-0.5 text-xs font-medium', selected ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-secondary text-muted-foreground')}>
        {t('serviceMinutes', { minutes: service.defaultDurationMin })}
      </span>
    </button>
  );
}

function AnyServiceChoice({ onSelect }: { readonly onSelect: () => void }): ReactNode {
  const t = useT('booking');
  return (
    <button type="button" onClick={onSelect} data-testid="service-any" className={cn(CARD_CLASS, 'items-center border border-dashed border-input')}>
      <CircleHelp aria-hidden="true" size={22} strokeWidth={2} className="flex-none text-primary" />
      <span className="flex flex-col gap-0.5">
        <span className="text-base font-semibold">{t('anyService')}</span>
        <span className="text-sm text-muted-foreground">{t('anyServiceHint')}</span>
      </span>
    </button>
  );
}

function ServiceList({ services, selectedServiceId, onSelect }: ServiceStepProps & { readonly services: ReadonlyArray<CatalogService> }): ReactNode {
  const t = useT('booking');
  if (services.length === 0) return <EmptyState title={t('servicesEmpty')} action={<AnyServiceChoice onSelect={() => onSelect(null)} />} />;
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {services.map((service) => (
          <li key={service.id} className="flex">
            <ServiceChoice service={service} selected={service.id === selectedServiceId} onSelect={() => onSelect(service.id)} />
          </li>
        ))}
      </ul>
      <AnyServiceChoice onSelect={() => onSelect(null)} />
    </div>
  );
}

/** Step 1: the service decides the doctors offered next and the length of the visit. */
export function ServiceStep({ selectedServiceId, onSelect }: ServiceStepProps): ReactNode {
  const t = useT('booking');
  const query = useServices();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[22px] font-bold">{t('serviceTitle')}</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">{t('serviceLead')}</p>
      </div>
      {query.data === undefined ? (
        <QueryFailure query={query} embedded pending={<QueryLoading />} />
      ) : (
        <ServiceList services={query.data.items} selectedServiceId={selectedServiceId} onSelect={onSelect} />
      )}
    </div>
  );
}
