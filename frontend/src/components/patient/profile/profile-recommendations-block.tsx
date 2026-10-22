'use client';

import type { ReactNode } from 'react';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { TableSkeleton } from '@/components/feedback/states';
import { Card } from '@/components/ui/card';
import { clinicDateKey } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { phoneOf } from './profile-completeness';
import { buildRecommendations } from './profile-recommendations';
import { RecommendationCards } from './profile-recommendation-cards';
import { useHiddenRecommendations } from './use-hidden-recommendations';
import { activeAppointments, type ProfileData } from './use-profile-data';

/**
 * Recommendations need the history and the appointments; if either fails the block shows that failure with a retry (a list
 * built from half the data would suggest a visit the patient already booked). The card and the prescriptions only add rules:
 * without them those rules are silent.
 */
export function ProfileRecommendations({ data, patientId }: { readonly data: ProfileData; readonly patientId: string | undefined }): ReactNode {
  const t = useT('patientProfile.reco');
  const { hidden, hide, restore } = useHiddenRecommendations(patientId);
  const { history, upcoming, patient, prescriptions } = data;
  let body: ReactNode;
  if (history.data === undefined) body = <QueryFailure query={history} embedded pending={<TableSkeleton />} />;
  else if (upcoming.data === undefined) body = <QueryFailure query={upcoming} embedded pending={<TableSkeleton />} />;
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
    body = <RecommendationCards items={shown} total={all.length} hiddenCount={all.length - shown.length} onHide={hide} onRestore={restore} />;
  }
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="profile-reco-title" data-testid="profile-recommendations" className="flex flex-col gap-4 p-6">
      <div>
        <h2 id="profile-reco-title" className="text-[22px] font-bold">{t('title')}</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">{t('subtitle')}</p>
      </div>
      {body}
    </Card>
  );
}
