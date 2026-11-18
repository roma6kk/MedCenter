'use client';

import { useContext } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Card } from '@/components/ui/card';
import type { CompleteEncounterForm } from '@/lib/contracts';
import { cn } from '@/lib/ui/cn';
import { motionSafeScrollBehavior } from '@/lib/ui/motion';
import { useT } from '@/lib/i18n/use-t';
import { EncounterAsideSlotContext } from './encounter-aside-slot';
import { REQUIRED_SECTIONS, SECTION_IDS, sectionDomId, sectionStates, type SectionId, type SectionState } from './encounter-sections';

const TITLE_KEY: Readonly<Record<SectionId, string>> = {
  observations: 'doctor.observations.legend',
  diagnoses: 'doctor.encounter.diagnosesLegend',
  services: 'doctor.services.legend',
  medications: 'doctor.medications.legend',
  conclusion: 'doctor.encounter.conclusionLegend',
};

function jumpTo(id: SectionId, event: MouseEvent<HTMLAnchorElement>): void {
  const target: HTMLElement | null = document.getElementById(sectionDomId(id));
  if (target === null) return;
  event.preventDefault();
  target.scrollIntoView?.({ behavior: motionSafeScrollBehavior(), block: 'start' });
  target.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
}

function StateMark({ state, isRequired }: { readonly state: SectionState; readonly isRequired: boolean }): ReactNode {
  const t = useT('doctor.encounter');
  const icon: ReactNode =
    state === 'filled' ? <CheckCircle2 aria-hidden="true" className="order-first size-4 shrink-0 text-success" /> :
    state === 'error' ? <AlertCircle aria-hidden="true" className="order-first size-4 shrink-0 text-destructive" /> :
    <Circle aria-hidden="true" className="order-first size-4 shrink-0 text-muted-foreground" />;
  const words: string = state === 'filled' ? t('sectionFilled') : state === 'error' ? t('sectionError') : isRequired ? t('sectionEmpty') : `${t('sectionEmpty')}, ${t('sectionOptional')}`;
  return (
    <>
      {icon}
      <span className="sr-only">{words}</span>
    </>
  );
}

interface NavItemsProps {
  readonly states: Readonly<Record<SectionId, SectionState>>;
  readonly itemClassName: string;
}

function NavItems({ states, itemClassName }: NavItemsProps): ReactNode {
  const t = useT();
  return (
    <>
      {SECTION_IDS.map((id) => (
        <li key={id}>
          <a href={`#${sectionDomId(id)}`} onClick={(event) => jumpTo(id, event)} data-state={states[id]} className={itemClassName}>
            <span>{t(TITLE_KEY[id])}</span>
            <StateMark state={states[id]} isRequired={REQUIRED_SECTIONS.has(id)} />
          </a>
        </li>
      ))}
    </>
  );
}

const LINK_BASE = 'inline-flex min-h-[44px] items-center gap-2 rounded-control text-sm font-medium text-foreground transition-[background-color] duration-fast ease-out hover:bg-secondary';

export function SectionNavigator(): ReactNode {
  const t = useT('doctor.encounter');
  const slot: HTMLElement | null = useContext(EncounterAsideSlotContext);
  const { control } = useFormContext<CompleteEncounterForm>();
  const values = useWatch({ control });
  const { errors } = useFormState({ control });
  const states = sectionStates(values as Partial<CompleteEncounterForm>, errors);
  return (
    <>
      <nav aria-label={t('sectionsNav')} className={cn('no-print', slot !== null && 'lg:hidden')}>
        <ol className="relative flex gap-2 overflow-x-auto pb-2">
          <NavItems states={states} itemClassName={`${LINK_BASE} whitespace-nowrap rounded-full border border-border-soft bg-card px-3 shadow-elev-1`} />
        </ol>
      </nav>
      {slot === null
        ? null
        : createPortal(
            <Card as="section" aria-labelledby="encounter-sections-title" className="no-print mb-4">
              <h2 id="encounter-sections-title" className="form-label">{t('sectionsNav')}</h2>
              <nav aria-label={t('sectionsNav')} className="mt-2">
                <ol className="grid gap-0.5">
                  <NavItems states={states} itemClassName={`${LINK_BASE} w-full px-2`} />
                </ol>
              </nav>
            </Card>,
            slot,
          )}
    </>
  );
}
