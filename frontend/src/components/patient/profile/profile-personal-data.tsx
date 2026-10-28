'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { FileText, Mail, Pill } from 'lucide-react';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { TableSkeleton } from '@/components/feedback/states';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button-variants';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { isApiError } from '@/lib/api/api-fetch';
import { errorCodeToUx } from '@/lib/api/error-code-map';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { PrintButton } from '../print-button';
import type { AccountProfile, PatientProfile } from '../patient-types';
import { useAccount, usePatientProfile } from '../use-patient-queries';
import { WRAP_TEXT } from '../wrap-text';
import type { Completeness } from './profile-completeness';
import { displayName, initialsOf } from './profile-name';
import { PhoneValue } from './profile-phone';

const GENDER_KEYS: Readonly<Record<string, string>> = { male: 'genderMale', female: 'genderFemale', other: 'genderOther' };

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-border-soft py-2.5 first:border-t-0">
      <dt className="w-32 flex-none text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 flex-[1_1_9rem] text-base', WRAP_TEXT)}>{children}</dd>
    </div>
  );
}

/** How much of the card is filled, as a slim bar and one line: the ring of the old header, in the one place that owns the data. */
function CompletenessLine({ completeness }: { readonly completeness: Completeness }): ReactNode {
  const t = useT('patientProfile.completeness');
  const hasOnlyPhoneMissing: boolean = completeness.missing.length === 1 && completeness.missing[0] === 'phone';
  return (
    <div data-testid="profile-completeness" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{t('title', { score: completeness.score })}</span>
      </div>
      <div
        role="progressbar"
        aria-label={t('ringLabel', { score: completeness.score })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completeness.score}
        className="h-2 overflow-hidden rounded-full bg-secondary"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-slow ease-out" style={{ width: `${completeness.score}%` }} />
      </div>
      <p className="text-sm leading-normal text-muted-foreground">
        {completeness.missing.length === 0
          ? t('done')
          : `${t('missingLead', { items: completeness.missing.map((item) => t(`item.${item}`)).join(', ') })}${hasOnlyPhoneMissing ? '' : ` ${t('howToFill')}`}`}
      </p>
    </div>
  );
}

function Identity({ account, patient }: { readonly account: AccountProfile; readonly patient: PatientProfile | null }): ReactNode {
  const name: string = patient?.fullName.trim() || displayName(account, patient);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3.5">
        <Avatar src={patient?.photoUrl} initials={initialsOf(name)} className="h-16 w-16 text-xl" />
        <span data-testid="profile-name" className={cn('text-lg font-bold', WRAP_TEXT)}>{name}</span>
      </div>
      <span className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', WRAP_TEXT)}>
        <Mail aria-hidden="true" size={16} className="flex-none" />
        {account.email}
      </span>
    </div>
  );
}

function CardRows({ patient, account }: { readonly patient: PatientProfile; readonly account: AccountProfile | undefined }): ReactNode {
  const t = useT('patient.profile');
  const format = useClinicFormat();
  return (
    <dl>
      {patient.birthDate ? <Row label={t('birthDate')}>{format.dateOnly(patient.birthDate)}</Row> : null}
      <Row label={t('gender')}>{t(GENDER_KEYS[patient.gender ?? ''] ?? 'genderUnknown')}</Row>
      <Row label={t('contactPhone')}><PhoneValue patient={patient} /></Row>
      {account?.createdAt ? <Row label={t('registered')}>{format.date(account.createdAt)}</Row> : null}
    </dl>
  );
}

/**
 * «Личные данные» (B4): the account and the FHIR card in one block, so the name and the e-mail appear once. Only the phone
 * is editable (3.12); the block says that the front desk changes the rest instead of showing buttons that would do nothing.
 * The account and the card each keep their own loading and failure.
 */
export function ProfilePersonalData({ completeness }: { readonly completeness: Completeness | null }): ReactNode {
  const t = useT('patientProfile.data');
  const tProfile = useT('patient.profile');
  const account = useAccount();
  const patient = usePatientProfile();
  const noCard: boolean = patient.isError && isApiError(patient.error) && errorCodeToUx(patient.error.problem.errorCode).kind === 'not-found';
  let card: ReactNode;
  if (patient.data !== undefined) card = <CardRows patient={patient.data} account={account.data} />;
  else if (noCard) card = <p data-testid="no-patient" className="text-sm text-muted-foreground">{tProfile('noPatient')}</p>;
  else card = <QueryFailure query={patient} embedded pending={<TableSkeleton />} />;
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="profile-data-title" id="profile-data" className="flex flex-col gap-4 p-[22px]">
      <h2 id="profile-data-title" className="text-lg font-bold">{t('title')}</h2>
      {account.data === undefined ? <QueryFailure query={account} embedded pending={<TableSkeleton />} /> : <Identity account={account.data} patient={patient.data ?? null} />}
      {account.data !== undefined && !account.data.isActive ? <p className="rounded-control bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive">{tProfile('inactive')}</p> : null}
      {completeness === null ? null : <CompletenessLine completeness={completeness} />}
      {card}
      <p className="text-xs leading-normal text-muted-foreground">{t('registryNote')}</p>
    </Card>
  );
}

/** Only documents that exist: the medical record has the extract and the prescriptions (with print), and the page itself prints. */
export function ProfileDocuments(): ReactNode {
  const t = useT('patientProfile.documents');
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="profile-docs-title" className="flex flex-col gap-3 p-[22px]">
      <h2 id="profile-docs-title" className="text-lg font-bold">{t('title')}</h2>
      <div className="flex flex-wrap gap-2">
        <Link href="/medcard" className={buttonVariants({ variant: 'secondary' })}><FileText aria-hidden="true" size={18} />{t('history')}</Link>
        <Link href="/medcard?tab=prescriptions" className={buttonVariants({ variant: 'secondary' })}><Pill aria-hidden="true" size={18} />{t('prescriptions')}</Link>
        <PrintButton label={t('print')} />
      </div>
    </Card>
  );
}
