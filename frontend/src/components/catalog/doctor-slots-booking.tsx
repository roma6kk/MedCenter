'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlotPicker } from '@/components/booking/slot-picker';
import { draftFromSlot } from '@/components/booking/booking-steps';
import { buttonVariants } from '@/components/ui/button-variants';
import { Skeleton } from '@/components/ui/skeleton';
import { useCanBook } from '@/hooks/use-can-book';
import { formatClinicDateTime } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { useUiStore } from '@/store/use-ui-store';
import type { CatalogService, Slot } from './catalog-types';

interface BookButtonProps {
  readonly selected: Slot | null;
  readonly onBook: () => void;
}

function BookButton({ selected, onBook }: BookButtonProps): ReactNode {
  const t = useT('catalog');
  const locale = useUiStore((state) => state.locale);
  return (
    <button
      type="button"
      onClick={onBook}
      disabled={selected === null}
      className={cn(buttonVariants({ variant: 'primary' }), 'w-full md:w-auto')}
    >
      {selected === null ? t('bookDisabled') : t('bookSelected', { time: formatClinicDateTime(selected.start, locale) })}
    </button>
  );
}

const CHIP_CLASS =
  'inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-medium transition-[background-color,border-color,color,transform] duration-fast ease-out active:scale-[0.97]';
const CHIP_IDLE_CLASS = 'border-border bg-card hover:border-primary hover:bg-primary-soft';
const CHIP_CHOSEN_CLASS = 'border-primary bg-primary-soft text-primary-soft-foreground';

interface ServiceChipsProps {
  readonly services: ReadonlyArray<CatalogService>;
  readonly chosenId: string;
  readonly onChoose: (service: CatalogService) => void;
}

function ServiceChips({ services, chosenId, onChoose }: ServiceChipsProps): ReactNode {
  const t = useT('catalog');
  return (
    <div role="group" aria-labelledby="doctor-service-label" className="space-y-2">
      <p id="doctor-service-label" className="form-label">{t('serviceLabel')}</p>
      <ul className="flex flex-wrap gap-2">
        {services.map((service) => {
          const chosen: boolean = service.id === chosenId;
          return (
            <li key={service.id}>
              <button type="button" aria-pressed={chosen} data-testid={`service-chip-${service.id}`} onClick={() => onChoose(service)} className={cn(CHIP_CLASS, chosen ? CHIP_CHOSEN_CLASS : CHIP_IDLE_CLASS)}>
                {service.name}
                <span className="tabular-nums text-xs text-muted-foreground">{t('minutes', { minutes: service.defaultDurationMin })}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface DoctorSlotsBookingProps {
  readonly doctorId: string;
  readonly services?: ReadonlyArray<CatalogService>;
  readonly servicesPending?: boolean;
}

export function DoctorSlotsBooking({ doctorId, services = [], servicesPending = false }: DoctorSlotsBookingProps): ReactNode {
  const t = useT('catalog');
  const router = useRouter();
  const canBook = useCanBook();
  const [selected, setSelected] = useState<Slot | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const service: CatalogService | null = services.find((item) => item.id === serviceId) ?? services[0] ?? null;
  const handleBook = (): void => {
    if (selected === null) return;
    useBookingDraftStore.getState().updateDraft(draftFromSlot(doctorId, selected, service?.id ?? null));
    router.push('/booking');
  };
  const handleChoose = (next: CatalogService): void => {
    setServiceId(next.id);
    setSelected(null);
  };
  return (
    <div className="space-y-4">
      {servicesPending ? <Skeleton aria-hidden="true" data-testid="service-chips-loading" className="h-11 w-2/3 rounded-full" /> : null}
      {service === null ? null : <ServiceChips services={services} chosenId={service.id} onChoose={handleChoose} />}
      {servicesPending ? null : <SlotPicker doctorId={doctorId} selectedSlotId={selected?.id ?? null} onSelect={setSelected} durationMin={service?.defaultDurationMin ?? null} serviceId={service?.id ?? null} />}
      <div className="no-print sticky bottom-0 -mx-4 border-t border-[var(--border)] bg-[var(--background)] p-4 md:static md:mx-0 md:border-0 md:p-0">
        {canBook ? <BookButton selected={selected} onBook={handleBook} /> : <p className="text-sm text-[var(--muted-foreground)]">{t('patientsOnly')}</p>}
      </div>
    </div>
  );
}
