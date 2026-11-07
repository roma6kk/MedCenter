'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { StaffConsentBody } from './staff-consent-panel';

export const CONSENT_ANCHOR = 'consent';

export interface ConsentManagementState {
  readonly isOpen: boolean;
  readonly toggle: () => void;
  readonly reveal: () => void;
  readonly toggleRef: RefObject<HTMLButtonElement>;
}

export function useConsentManagement(): ConsentManagementState {
  const [isOpen, setIsOpen] = useState(false);
  const [revealCount, setRevealCount] = useState(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const reveal = useCallback((): void => {
    setIsOpen(true);
    setRevealCount((count) => count + 1);
  }, []);
  const toggle = useCallback((): void => setIsOpen((open) => !open), []);
  useEffect(() => {
    if (revealCount === 0) return;
    // `scrollIntoView` is missing in some test engines; the focus follows so a keyboard user lands on the section too.
    toggleRef.current?.scrollIntoView?.({ block: 'start' });
    toggleRef.current?.focus({ preventScroll: true });
  }, [revealCount]);
  useEffect(() => {
    const check = (): void => {
      if (window.location.hash === `#${CONSENT_ANCHOR}`) reveal();
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [reveal]);
  return { isOpen, toggle, reveal, toggleRef };
}

export function ConsentManagementSection({ patientId, management }: { readonly patientId: string; readonly management: ConsentManagementState }): ReactNode {
  const t = useT('consent.staff');
  const headingId: string = useId();
  const panelId: string = useId();
  return (
    <Card as="section" radius="panel" padding="none" id={CONSENT_ANCHOR} aria-labelledby={headingId} className="mt-6 scroll-mt-4">
      <h2 id={headingId} className="text-lg font-bold">
        <button
          ref={management.toggleRef}
          type="button"
          aria-expanded={management.isOpen}
          aria-controls={panelId}
          onClick={management.toggle}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-panel p-[22px] text-left"
        >
          {t('manageTitle')}
          <ChevronDown aria-hidden="true" className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-fast ease-out', management.isOpen && 'rotate-180')} />
        </button>
      </h2>
      {management.isOpen ? (
        <div id={panelId} className="flex flex-col gap-3 border-t border-border-soft px-[22px] pb-[22px] pt-4">
          <p className="text-xs leading-normal text-muted-foreground">{t('lead')}</p>
          <StaffConsentBody patientId={patientId} role="DOCTOR" />
        </div>
      ) : null}
    </Card>
  );
}
