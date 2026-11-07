'use client';

import type { ReactNode } from 'react';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { Card } from '@/components/ui/card';
import { clinicDateKey } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { phoneOf } from './profile-completeness';
import { buildRecommendations } from './profile-recommendations';
import { RecommendationCards } from './profile-recommendation-cards';
import { useHiddenRecommendations } from './use-hidden-recommendations';
import { activeAppointments, type ProfileData } from './use-profile-data';

// Half the data would suggest a visit already booked, so either failing read fails the block.
export function ProfileRecommendations({ data, patientId }: { readonly data: ProfileData; readonly patientId: string | undefined }): ReactNode {
  const t = useT('patientProfile.reco');
  const { hidden, hide, restore } = useHiddenRecommendations(patientId);
  const { history, upcoming, patient, prescriptions } = data;
  let body: ReactNode;
  if (history.data === undefined) body = <QueryFailure query={history} embedded pending={<ContentSkeleton shape="cards" rows={2} />} />;
  else if (upcoming.data === undefined) body = <QueryFailure query={upcoming} embedded pending={<ContentSkeleton shape="cards" rows={2} />} />;
  else {
    const all = buildRecommendations({
      birthDate: patient.data?.birthDate,
      hasPhone: patient.data === undefined ? undefined : phoneOf(patient.data) !== undefined,
      history: history.data.items,
      historyComplete: history.data.meta.totalPages <= 1,
      appointments: activeAppointments(upcoming.data),
      prescriptions: prescriptions.data?.items ?? [],
      today: clinicDateKey(),
    });
    const shown = all.filter((item) => !hidden.includes(item.id));
    const card = patient.data;
    body = (
      <RecommendationCards
        items={shown}
        hiddenCount={all.length - shown.length}
        onHide={hide}
        onRestore={restore}
        {...(card?.version === undefined ? {} : { phoneCard: { ...card, version: card.version } })}
      />
    );
  }
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="profile-reco-title" data-testid="profile-recommendations" className="flex flex-col gap-4 p-6">
      <div>
        <h2 id="profile-reco-title" className="text-xl font-bold">{t('title')}</h2>
        <p className="mt-1 text-base text-muted-foreground">{t('subtitle')}</p>
      </div>
      {body}
    </Card>
  );
}
