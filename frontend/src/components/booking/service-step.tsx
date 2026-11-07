'use client';

import type { ReactNode } from 'react';
import { Check, CircleHelp, Clock } from 'lucide-react';
import { QueryLoading } from '@/components/catalog/query-loading';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useServices } from '@/components/catalog/use-catalog';
import type { CatalogService } from '@/components/catalog/catalog-types';
import { DIRECTIONS } from '@/components/catalog/home-content';
import { EmptyState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cardVariants } from '@/components/ui/card-variants';
import { cn } from '@/lib/ui/cn';
import { useT } from '@/lib/i18n/use-t';
import { OTHER_GROUP_KEY, type ServiceGroup } from './service-groups';
import { visibleDescription } from './service-text';
import { useServiceGroups } from './use-service-groups';

const CARD_CLASS = 'flex min-h-[44px] w-full gap-3.5 text-left';

interface ServiceStepProps {
  readonly selectedServiceId: string | null;
  readonly onSelect: (serviceId: string | null) => void;
}

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
  const description: string | undefined = visibleDescription(service.name, service.description);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={`service-${service.id}`}
      className={cn(cardVariants({ tone: selected ? 'selected' : 'interactive' }), CARD_CLASS)}
    >
      <Marker selected={selected} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="break-words text-base font-semibold">{service.name}</span>
        {description === undefined ? null : <span className="text-sm text-muted-foreground">{description}</span>}
        <Badge tone={selected ? 'primary' : 'neutral'} icon={Clock} className="tabular-nums mt-1.5 h-fit self-start">
          {t('serviceMinutes', { minutes: service.defaultDurationMin })}
        </Badge>
      </span>
    </button>
  );
}

function AnyServiceChoice({ onSelect }: { readonly onSelect: () => void }): ReactNode {
  const t = useT('booking');
  return (
    <button type="button" onClick={onSelect} data-testid="service-any" className={cn(cardVariants({ tone: 'interactive' }), CARD_CLASS, 'items-center border-dashed border-input shadow-none')}>
      <CircleHelp aria-hidden="true" size={22} strokeWidth={2} className="flex-none text-primary" />
      <span className="flex flex-col gap-0.5">
        <span className="text-base font-semibold">{t('anyService')}</span>
        <span className="text-sm text-muted-foreground">{t('anyServiceHint')}</span>
      </span>
    </button>
  );
}

function useGroupLabel(): (group: ServiceGroup) => string {
  const t = useT('booking');
  const home = useT('home');
  return (group) => {
    if (group.key === OTHER_GROUP_KEY || group.specialty === null) return t('serviceGroupOther');
    const direction = DIRECTIONS.find((item) => item.specialtyCode !== undefined && item.specialtyCode === group.specialty?.code);
    return direction === undefined ? (group.specialty.label ?? t('serviceGroupOther')) : home(`directions.${direction.id}.name`);
  };
}

function ServiceGrid({ services, selectedServiceId, onSelect }: ServiceStepProps & { readonly services: ReadonlyArray<CatalogService> }): ReactNode {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
      {services.map((service) => (
        <li key={service.id} className="flex">
          <ServiceChoice service={service} selected={service.id === selectedServiceId} onSelect={() => onSelect(service.id)} />
        </li>
      ))}
    </ul>
  );
}

function GroupedServices({ services, selectedServiceId, onSelect }: ServiceStepProps & { readonly services: ReadonlyArray<CatalogService> }): ReactNode {
  const { groups, isPending } = useServiceGroups(services);
  const labelOf = useGroupLabel();
  if (isPending) return <QueryLoading />;
  if (groups.length < 2) return <ServiceGrid services={services} selectedServiceId={selectedServiceId} onSelect={onSelect} />;
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.key} aria-label={labelOf(group)} data-testid={`service-group-${group.key}`} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-muted-foreground">{labelOf(group)}</h3>
          <ServiceGrid services={group.services} selectedServiceId={selectedServiceId} onSelect={onSelect} />
        </section>
      ))}
    </div>
  );
}

interface ServiceListProps extends ServiceStepProps {
  readonly services: ReadonlyArray<CatalogService>;
  readonly onRefresh: () => void;
}

function ServiceList({ services, selectedServiceId, onSelect, onRefresh }: ServiceListProps): ReactNode {
  const t = useT('booking');
  if (services.length === 0) {
    return (
      <EmptyState
        title={t('servicesEmpty')}
        description={t('servicesEmptyHint')}
        action={
          <div className="flex flex-col items-stretch gap-3">
            <Button variant="secondary" onClick={onRefresh} data-testid="services-refresh" className="self-center">{t('refresh')}</Button>
            <AnyServiceChoice onSelect={() => onSelect(null)} />
          </div>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <GroupedServices services={services} selectedServiceId={selectedServiceId} onSelect={onSelect} />
      <AnyServiceChoice onSelect={() => onSelect(null)} />
    </div>
  );
}

export function ServiceStep({ selectedServiceId, onSelect }: ServiceStepProps): ReactNode {
  const t = useT('booking');
  const query = useServices();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">{t('serviceTitle')}</h2>
        <p className="mt-1 text-base text-muted-foreground">{t('serviceLead')}</p>
      </div>
      {query.data === undefined ? (
        <QueryFailure query={query} embedded pending={<QueryLoading />} />
      ) : (
        <ServiceList services={query.data.items} selectedServiceId={selectedServiceId} onSelect={onSelect} onRefresh={() => void query.refetch()} />
      )}
    </div>
  );
}
