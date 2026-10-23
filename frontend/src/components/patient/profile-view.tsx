'use client';

import type { ReactNode } from 'react';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { TableSkeleton } from '@/components/feedback/states';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { isApiError } from '@/lib/api/api-fetch';
import { errorCodeToUx } from '@/lib/api/error-code-map';
import { useT } from '@/lib/i18n/use-t';
import { MyConsentSection } from '@/components/consent/my-consent-section';
import { computeCompleteness, type Completeness } from './profile/profile-completeness';
import { doctorsOf, ProfileDoctors } from './profile/profile-doctors';
import { ProfileHeader } from './profile/profile-header';
import { ProfileDocuments, ProfilePersonalData } from './profile/profile-personal-data';
import { ProfileQuickActions } from './profile/profile-quick-actions';
import { ProfileRecommendations } from './profile/profile-recommendations-block';
import { LastVisitCard, NextVisitCard } from './profile/profile-visits';
import { activeAppointments, countOf, newestFinished, useProfileData, type ProfileData } from './profile/use-profile-data';

function isNoCard(patient: ProfileData['patient']): boolean {
  return patient.isError && isApiError(patient.error) && errorCodeToUx(patient.error.problem.errorCode).kind === 'not-found';
}

/** The ring is shown once the card is known: loaded, or known to be missing (404). A failed read must not look like an empty profile. */
function completenessOf(data: ProfileData): Completeness | null {
  if (data.patient.data !== undefined) return computeCompleteness(data.patient.data, data.account.data);
  return isNoCard(data.patient) ? computeCompleteness(null, data.account.data) : null;
}

function Header({ data }: { readonly data: ProfileData }): ReactNode {
  const t = useT('patient.profile');
  if (data.account.data === undefined) {
    return (
      <section aria-labelledby="profile-name" className="flex flex-col gap-4">
        <h1 id="profile-name" className="text-[28px] font-bold tracking-tight sm:text-[34px]">{t('title')}</h1>
        <QueryFailure query={data.account} embedded pending={<TableSkeleton />} />
      </section>
    );
  }
  return <ProfileHeader account={data.account.data} patient={data.patient.data ?? null} completeness={completenessOf(data)} />;
}

function Visits({ data }: { readonly data: ProfileData }): ReactNode {
  const upcoming = data.upcoming;
  const booked = activeAppointments(upcoming.data);
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-stretch gap-4">
      {upcoming.data === undefined ? <FailureCard query={upcoming} /> : <NextVisitCard appointment={booked[0]} more={Math.max(booked.length - 1, 0)} />}
      {data.history.data === undefined ? <FailureCard query={data.history} /> : <LastVisitCard entry={newestFinished(data.history.data)} />}
    </div>
  );
}

function FailureCard({ query }: { readonly query: ProfileData['upcoming'] | ProfileData['history'] }): ReactNode {
  return <div className="rounded-panel border border-border bg-card p-[22px]"><QueryFailure query={query} embedded pending={<TableSkeleton />} /></div>;
}

/**
 * The patient's home in the clinic (FR-001): who they are and how complete the card is, what to do next, what the clinic
 * recommends, the nearest and the last visit, the data. Each block reads and fails on its own. Personal data stays
 * read-only because the API has no write for it.
 */
export function ProfileView(): ReactNode {
  const t = useT('patient.profile');
  useDocumentTitle(t('title'));
  const data = useProfileData();
  const booked = activeAppointments(data.upcoming.data);
  const patientId: string | undefined = data.patient.data?.id ?? data.account.data?.id;
  return (
    <div className="flex flex-col gap-6">
      <Header data={data} />
      <ProfileQuickActions
        upcoming={data.upcoming.data === undefined ? null : { value: booked.length, more: data.upcoming.data.meta.totalPages > 1 }}
        activePrescriptions={countOf(data.prescriptions.data, (item) => item.status === 'active')}
      />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-6">
          <ProfileRecommendations data={data} patientId={patientId} />
          <Visits data={data} />
          <ProfileDoctors doctors={doctorsOf(booked)} />
        </div>
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <ProfilePersonalData />
          <MyConsentSection />
          <ProfileDocuments />
        </aside>
      </div>
    </div>
  );
}
