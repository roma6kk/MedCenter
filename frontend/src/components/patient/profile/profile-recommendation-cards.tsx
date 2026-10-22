'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CalendarClock, HeartPulse, Phone, Stethoscope, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button-variants';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { WRAP_TEXT } from '../wrap-text';
import type { Recommendation, RecommendationKind } from './profile-recommendations';

const ICONS: Readonly<Record<RecommendationKind, LucideIcon>> = { 'follow-up': CalendarClock, referral: Stethoscope, prevention: HeartPulse, profile: Phone };

interface RecommendationCardsProps {
  readonly items: ReadonlyArray<Recommendation>;
  /** How many exist before the hidden ones are taken away. */
  readonly total: number;
  readonly hiddenCount: number;
  readonly onHide: (id: string) => void;
  readonly onRestore: () => void;
}

function RecommendationCard({ item, onHide }: { readonly item: Recommendation; readonly onHide: (id: string) => void }): ReactNode {
  const t = useT('patientProfile');
  const format = useClinicFormat();
  const Icon: LucideIcon = ICONS[item.kind];
  const values = { ...item.params, ...(item.params?.['day'] === undefined ? {} : { day: format.dateOnly(String(item.params['day'])) }) };
  const title: string = t(item.titleKey, values);
  return (
    <Card as="li" padding="none" data-testid={`reco-${item.id}`} className="flex flex-col gap-2.5 p-[18px]">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className={cn('inline-flex h-10 w-10 flex-none items-center justify-center rounded-[12px]', item.kind === 'profile' ? 'bg-warning-soft text-warning' : 'bg-primary-soft text-primary-soft-foreground')}>
          <Icon size={20} />
        </span>
        <span className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">{t(`reco.tag.${item.kind}`, values)}</span>
      </div>
      <h3 className={cn('text-[17px] font-bold', WRAP_TEXT)}>{title}</h3>
      <p className="text-sm leading-normal text-muted-foreground">{t(item.textKey, values)}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Link href={item.ctaHref} className={buttonVariants({ variant: 'primary' })}>{t(item.ctaKey)}</Link>
        <button type="button" onClick={() => onHide(item.id)} aria-label={t('reco.hideLabel', { title })} className={buttonVariants({ variant: 'ghost' })}>{t('reco.hide')}</button>
      </div>
    </Card>
  );
}

/** "Рекомендации для вас": cards with a call to action and «Скрыть»; the dismissed ones come back with «Показать скрытые». */
export function RecommendationCards({ items, total, hiddenCount, onHide, onRestore }: RecommendationCardsProps): ReactNode {
  const t = useT('patientProfile.reco');
  return (
    <>
      {total > 0 ? <span className="text-sm text-muted-foreground">{t('counter', { shown: items.length, total })}</span> : null}
      {items.length > 0 ? (
        <ul aria-label={t('listLabel')} className="grid list-none grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {items.map((item) => <RecommendationCard key={item.id} item={item} onHide={onHide} />)}
        </ul>
      ) : (
        <div data-testid="reco-empty" className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-background p-5">
          <span className="text-[15px] text-muted-foreground">{t('empty')}</span>
        </div>
      )}
      {hiddenCount > 0 ? (
        <div><button type="button" onClick={onRestore} className={buttonVariants({ variant: 'secondary' })}>{t('showHidden')}</button></div>
      ) : null}
    </>
  );
}
