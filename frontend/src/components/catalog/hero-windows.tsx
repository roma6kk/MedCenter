'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { draftFromSlot } from '@/components/booking/booking-steps';
import { describeWhen } from '@/components/booking/slot-when';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useCanBook } from '@/hooks/use-can-book';
import { doctorLabel } from '@/lib/doctor-name';
import { useT } from '@/lib/i18n/use-t';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { useUiStore } from '@/store/use-ui-store';
import type { Doctor } from './catalog-types';
import { doctorInitials } from './doctor-initials';
import { useSoonestWindows, type SoonestWindow } from './use-soonest-windows';

const WINDOWS_SHOWN = 3;
const DOCTORS_ASKED = 4;

const WINDOW_CHIP_CLASS =
  'inline-flex min-h-[44px] flex-none items-center rounded-control bg-primary-soft px-3 text-sm font-semibold tabular-nums text-primary-soft-foreground transition-[background-color,transform] duration-fast ease-out hover:bg-primary-soft-hover active:scale-[0.97]';
const WINDOW_TEXT_CLASS = 'flex-none text-sm font-semibold tabular-nums text-muted-foreground';

function WindowRow({ entry, today }: { readonly entry: SoonestWindow; readonly today: string }): ReactNode {
  const t = useT('booking');
  const router = useRouter();
  const locale = useUiStore((state) => state.locale);
  const canBook = useCanBook();
  const { doctor, slot } = entry;
  const when: string = describeWhen(slot.start, today, locale, t);
  const book = (): void => {
    useBookingDraftStore.getState().updateDraft(draftFromSlot(doctor.id, slot));
    router.push('/booking');
  };
  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar src={doctor.photoUrl} initials={doctorInitials(doctor)} className="h-11 w-11 text-base" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight">{doctorLabel(doctor)}</p>
        <p className="truncate text-sm text-muted-foreground">{doctor.specialty ?? ''}</p>
      </div>
      {canBook ? (
        <button type="button" data-testid={`hero-window-${doctor.id}`} aria-label={t('bookNearest', { when, doctor: doctorLabel(doctor) })} onClick={book} className={WINDOW_CHIP_CLASS}>
          {when}
        </button>
      ) : (
        <span data-testid={`hero-window-${doctor.id}`} className={WINDOW_TEXT_CLASS}>{when}</span>
      )}
    </li>
  );
}

function WindowSkeleton(): ReactNode {
  const t = useT('home');
  return (
    <div role="status" aria-busy="true" data-testid="hero-windows-loading">
      <span className="sr-only">{t('windowsLoading')}</span>
      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden="true" className="flex items-center gap-3 py-3">
          <Skeleton shape="circle" className="size-11" />
          <div className="flex-1 space-y-2"><Skeleton className="w-3/4" /><Skeleton className="w-1/2" /></div>
          <Skeleton className="h-11 w-28 rounded-control" />
        </div>
      ))}
    </div>
  );
}

export function HeroWindows({ doctors }: { readonly doctors: ReadonlyArray<Doctor> }): ReactNode {
  const t = useT('home');
  const asked: ReadonlyArray<Doctor> = doctors.slice(0, DOCTORS_ASKED);
  const { today, windows, isPending } = useSoonestWindows(asked, WINDOWS_SHOWN);
  if (asked.length === 0) return null;
  return (
    <section aria-labelledby="hero-windows" className="relative rounded-card bg-card p-5 shadow-elev-2">
      <h2 id="hero-windows" className="flex items-center gap-2 text-base font-bold">
        <CalendarClock aria-hidden="true" className="h-5 w-5 flex-none text-primary" />
        {t('windowsTitle')}
      </h2>
      {isPending ? (
        <WindowSkeleton />
      ) : windows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('windowsEmpty')}</p>
      ) : (
        <ul className="mt-1 divide-y divide-border-soft">
          {windows.map((entry) => <WindowRow key={entry.doctor.id} entry={entry} today={today} />)}
        </ul>
      )}
      <Link href="/doctors" className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('windowsAll')}</Link>
    </section>
  );
}
