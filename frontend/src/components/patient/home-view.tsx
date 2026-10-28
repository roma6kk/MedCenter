'use client';

import type { ReactNode } from 'react';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { isApiError } from '@/lib/api/api-fetch';
import { errorCodeToUx } from '@/lib/api/error-code-map';
import { useT } from '@/lib/i18n/use-t';
import { MyConsentSection } from '@/components/consent/my-consent-section';
import { HomeHero } from './profile/home-hero';
import { computeCompleteness, type Completeness } from './profile/profile-completeness';
import { doctorsOf, ProfileDoctors } from './profile/profile-doctors';
import { ProfileDocuments, ProfilePersonalData } from './profile/profile-personal-data';
import { ProfileQuickActions } from './profile/profile-quick-actions';
import { ProfileRecommendations } from './profile/profile-recommendations-block';
import { LastVisitCard } from './profile/profile-visits';
import { activeAppointments, countOf, newestFinished, useProfileData, type ProfileData } from './profile/use-profile-data';

function isNoCard(patient: ProfileData['patient']): boolean {
  return patient.isError && isApiError(patient.error) && errorCodeToUx(patient.error.problem.errorCode).kind === 'not-found';
}

/** The completeness is shown once the card is known: loaded, or known to be missing (404). A failed read must not look like an empty profile. */
function completenessOf(data: ProfileData): Completeness | null {
  if (data.patient.data !== undefined) return computeCompleteness(data.patient.data, data.account.data);
  return isNoCard(data.patient) ? computeCompleteness(null, data.account.data) : null;
}

function LastVisit({ data }: { readonly data: ProfileData }): ReactNode {
  if (data.history.data !== undefined) return <LastVisitCard entry={newestFinished(data.history.data)} />;
  return <div className="rounded-panel border border-border bg-card p-[22px]"><QueryFailure query={data.history} embedded pending={<ContentSkeleton shape="timeline" rows={2} />} /></div>;
}

/**
 * The patient's home in the clinic (FR-001, B4/B6): the greeting with the nearest visit, the quick actions, what the clinic
 * recommends, the last visit, then the personal data with the consent line and the documents. The main column is the wide one
 * and carries what changes; the narrow one carries what stays, so neither is left with a hole under it. Each block reads and
 * fails on its own. Personal data stays read-only apart from the phone because the API has no other write.
 */
export function HomeView(): ReactNode {
  const t = useT('patientHome');
  useDocumentTitle(t('title'));
  const data = useProfileData();
  const booked = activeAppointments(data.upcoming.data);
  const patientId: string | undefined = data.patient.data?.id ?? data.account.data?.id;
  return (
    <div className="flex flex-col gap-6">
      <HomeHero data={data} />
      <ProfileQuickActions
        upcoming={data.upcoming.data === undefined ? null : { value: booked.length, more: data.upcoming.data.meta.totalPages > 1 }}
        activePrescriptions={countOf(data.prescriptions.data, (item) => item.status === 'active')}
      />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <ProfileRecommendations data={data} patientId={patientId} />
          <LastVisit data={data} />
          <ProfileDoctors doctors={doctorsOf(booked)} />
          <ProfileDocuments />
        </div>
        <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-6">
          <ProfilePersonalData completeness={completenessOf(data)} />
          <MyConsentSection />
        </aside>
      </div>
    </div>
  );
}
