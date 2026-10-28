'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarClock, HeartPulse, Phone, Stethoscope, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button-variants';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { WRAP_TEXT } from '../wrap-text';
import type { PatientProfile } from '../patient-types';
import { PhoneForm } from './profile-phone';
import type { Recommendation, RecommendationKind } from './profile-recommendations';

const ICONS: Readonly<Record<RecommendationKind, LucideIcon>> = { 'follow-up': CalendarClock, referral: Stethoscope, prevention: HeartPulse, profile: Phone };

interface RecommendationCardsProps {
  readonly items: ReadonlyArray<Recommendation>;
  readonly hiddenCount: number;
  readonly onHide: (id: string) => void;
  readonly onRestore: () => void;
  /** The card that can take the phone right here (it needs its `version`); without it «Добавить номер» is a link to the personal data. */
  readonly phoneCard?: PatientProfile & { readonly version: string };
}

interface CardProps {
  readonly item: Recommendation;
  readonly onHide: (id: string) => void;
  readonly phoneCard: (PatientProfile & { readonly version: string }) | undefined;
}

function RecommendationCard({ item, onHide, phoneCard }: CardProps): ReactNode {
  const t = useT('patientProfile');
  const [isEditing, setIsEditing] = useState(false);
  // B5: «Добавьте номер телефона» asks for the number in the card itself instead of sending the patient looking for the field.
  const takesPhoneHere: boolean = item.id === 'phone' && phoneCard !== undefined;
  const format = useClinicFormat();
  const Icon: LucideIcon = ICONS[item.kind];
  const values = { ...item.params, ...(item.params?.['day'] === undefined ? {} : { day: format.dateOnly(String(item.params['day'])) }) };
  const title: string = t(item.titleKey, values);
  return (
    <Card as="li" padding="none" data-testid={`reco-${item.id}`} className="flex flex-col gap-2.5 p-[18px]">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className={cn('inline-flex h-10 w-10 flex-none items-center justify-center rounded-control', item.kind === 'profile' ? 'bg-warning-soft text-warning' : 'bg-primary-soft text-primary-soft-foreground')}>
          <Icon size={20} />
        </span>
        <span className="text-sm font-semibold text-muted-foreground">{t(`reco.tag.${item.kind}`, values)}</span>
      </div>
      <h3 className={cn('text-lg font-bold', WRAP_TEXT)}>{title}</h3>
      {takesPhoneHere && isEditing && phoneCard !== undefined ? (
        <PhoneForm patient={phoneCard} onClose={() => setIsEditing(false)} fieldId="reco-phone" autoFocus />
      ) : (
        <>
          <p className="text-sm leading-normal text-muted-foreground">{t(item.textKey, values)}</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            {takesPhoneHere ? (
              <button type="button" onClick={() => setIsEditing(true)} className={buttonVariants({ variant: 'primary' })}>{t(item.ctaKey)}</button>
            ) : (
              <Link href={item.ctaHref} className={buttonVariants({ variant: 'primary' })}>{t(item.ctaKey)}</Link>
            )}
            <button type="button" onClick={() => onHide(item.id)} aria-label={t('reco.hideLabel', { title })} className={buttonVariants({ variant: 'ghost' })}>{t('reco.hide')}</button>
          </div>
        </>
      )}
    </Card>
  );
}

/** "Рекомендации для вас": cards with a call to action and «Скрыть»; the dismissed ones come back with «Показать скрытые». */
export function RecommendationCards({ items, hiddenCount, onHide, onRestore, phoneCard }: RecommendationCardsProps): ReactNode {
  const t = useT('patientProfile.reco');
  return (
    <>
      {items.length > 0 ? (
        <ul aria-label={t('listLabel')} className="grid list-none grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {items.map((item) => <RecommendationCard key={item.id} item={item} onHide={onHide} phoneCard={phoneCard} />)}
        </ul>
      ) : (
        <div data-testid="reco-empty" className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-background p-5">
          <span className="text-base text-muted-foreground">{t('empty')}</span>
        </div>
      )}
      {hiddenCount > 0 ? (
        <div><button type="button" onClick={onRestore} className={buttonVariants({ variant: 'secondary' })}>{t('showHidden')}</button></div>
      ) : null}
    </>
  );
}
