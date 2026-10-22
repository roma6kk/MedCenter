'use client';

import type { ReactNode } from 'react';
import { useId } from 'react';
import { SECONDARY_BUTTON_CLASS } from '@/components/catalog/catalog-styles';
import { formatDayShort } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { useDateDraft } from './use-date-draft';
import type { SlotWindowState } from './use-slot-window';

/** A period button at either end of the calendar stays focusable (`aria-disabled`, not `disabled`): pressing it must not drop the keyboard focus. */
interface PeriodButtonProps {
  readonly label: string;
  readonly enabled: boolean;
  readonly onClick: () => void;
  /** Id of the text that says why the button is closed. */
  readonly describedBy?: string;
}

function PeriodButton({ label, enabled, onClick, describedBy }: PeriodButtonProps): ReactNode {
  return (
    <button
      type="button"
      onClick={() => (enabled ? onClick() : undefined)}
      aria-disabled={enabled ? undefined : true}
      aria-describedby={enabled ? undefined : describedBy}
      className={SECONDARY_BUTTON_CLASS}
    >
      {label}
    </button>
  );
}

/** The date field: shows what is being typed, passes every typed day on (see `useDateDraft`). */
function JumpToDate({ state }: { readonly state: SlotWindowState }): ReactNode {
  const t = useT('booking');
  const dateId: string = useId();
  const date = useDateDraft(state.window.from, state.jumpTo);
  return (
    <div>
      <label htmlFor={dateId} className="form-label block">{t('jumpToDate')}</label>
      <input
        id={dateId}
        type="date"
        value={date.value}
        min={state.today}
        max={state.lastDay}
        onChange={date.onChange}
        onBlur={date.onBlur}
        className="mt-1 min-h-[44px] w-full rounded-control border border-input bg-card px-2 sm:w-auto"
      />
    </div>
  );
}

/** Moves the searched period: earlier / later by a whole period, or straight to a typed date. */
export function SlotPeriodControl({ state }: { readonly state: SlotWindowState }): ReactNode {
  const t = useT('booking');
  const locale = useUiStore((store) => store.locale);
  const limitId: string = useId();
  const { window, canGoBack, canGoForward, goBack, goForward } = state;
  return (
    <div role="group" aria-label={t('periodNav')} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="grid grid-cols-2 items-center gap-2 sm:flex">
        <PeriodButton label={t('prevPeriod')} enabled={canGoBack} onClick={goBack} />
        <p className="order-first col-span-2 text-center text-sm sm:order-none sm:min-w-[9rem] sm:flex-1" data-testid="slot-period">
          {t('periodLabel', { from: formatDayShort(window.from, locale), to: formatDayShort(window.to, locale) })}
        </p>
        <PeriodButton label={t('nextPeriod')} enabled={canGoForward} onClick={goForward} describedBy={limitId} />
      </div>
      <JumpToDate state={state} />
      {canGoForward ? null : <p id={limitId} className="w-full text-xs text-[var(--muted-foreground)]">{t('nextPeriodLimit')}</p>}
    </div>
  );
}
