'use client';

import type { ReactNode } from 'react';
import { useId } from 'react';
import { SECONDARY_BUTTON_CLASS } from '@/components/catalog/catalog-styles';
import { DatePicker } from '@/components/ui/date-picker';
import { formatDayShort } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { useDateDraft } from './use-date-draft';
import type { SlotWindowState } from './use-slot-window';

/** `aria-disabled`, not `disabled`: pressing an end button must not drop the keyboard focus. */
interface PeriodButtonProps {
  readonly label: string;
  readonly enabled: boolean;
  readonly onClick: () => void;
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

function JumpToDate({ state }: { readonly state: SlotWindowState }): ReactNode {
  const t = useT('booking');
  const dateId: string = useId();
  const date = useDateDraft(state.window.from, state.jumpTo);
  return (
    <div className="grid gap-1.5">
      <label htmlFor={dateId} className="form-label">{t('jumpToDate')}</label>
      <DatePicker id={dateId} value={date.value} min={state.today} max={state.lastDay} onChange={date.onChange} onBlur={date.onBlur} wrapperClassName="sm:w-44" />
    </div>
  );
}

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
