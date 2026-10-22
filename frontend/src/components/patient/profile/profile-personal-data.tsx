'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { TableSkeleton } from '@/components/feedback/states';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button-variants';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { isApiError } from '@/lib/api/api-fetch';
import { errorCodeToUx } from '@/lib/api/error-code-map';
import type { Translate } from '@/lib/i18n/translate';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { DefinitionList, DefinitionRow } from '../definition-list';
import { PrintButton } from '../print-button';
import type { AccountProfile, ContactPoint, PatientProfile } from '../patient-types';
import { useAccount, usePatientProfile } from '../use-patient-queries';
import { phoneOf } from './profile-completeness';
import { displayName } from './profile-header';

const GENDER_KEYS: Readonly<Record<string, string>> = { male: 'genderMale', female: 'genderFemale', other: 'genderOther' };
const CONTACT_KEYS: Readonly<Record<string, string>> = { email: 'contactEmail', phone: 'contactPhone' };

function contactLabel(t: Translate, system: string): string {
  const key: string | undefined = CONTACT_KEYS[system];
  return key === undefined ? system : t(key);
}

function ContactRows({ contacts }: { readonly contacts: ReadonlyArray<ContactPoint> }): ReactNode {
  const t = useT('patient.profile');
  if (contacts.length === 0) return null;
  return (
    <DefinitionRow label={t('contacts')}>
      <ul className="grid gap-1">
        {contacts.map((contact) => (
          <li key={`${contact.system}-${contact.value}`}><span className="text-muted-foreground">{contactLabel(t, contact.system)}: </span>{contact.value}</li>
        ))}
      </ul>
    </DefinitionRow>
  );
}

function AccountRows({ account }: { readonly account: AccountProfile }): ReactNode {
  const t = useT('patient.profile');
  const format = useClinicFormat();
  return (
    <DefinitionList>
      <DefinitionRow label={t('name')}>{displayName(account, null)}</DefinitionRow>
      <DefinitionRow label={t('email')}>{account.email}</DefinitionRow>
      <DefinitionRow label={t('status')}>{account.isActive ? t('active') : t('inactive')}</DefinitionRow>
      {account.createdAt ? <DefinitionRow label={t('registered')}>{format.date(account.createdAt)}</DefinitionRow> : null}
    </DefinitionList>
  );
}

function PatientRows({ patient }: { readonly patient: PatientProfile }): ReactNode {
  const t = useT('patient.profile');
  const tData = useT('patientProfile.data');
  const format = useClinicFormat();
  const fullName: string = patient.fullName === '' ? [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(' ') : patient.fullName;
  return (
    <DefinitionList>
      <DefinitionRow label={t('name')}>{fullName}</DefinitionRow>
      {patient.birthDate ? <DefinitionRow label={t('birthDate')}>{format.dateOnly(patient.birthDate)}</DefinitionRow> : null}
      <DefinitionRow label={t('gender')}>{t(GENDER_KEYS[patient.gender ?? ''] ?? 'genderUnknown')}</DefinitionRow>
      <ContactRows contacts={patient.telecom} />
      {phoneOf(patient) === undefined ? <DefinitionRow label={t('contactPhone')}><span className="font-semibold text-warning">{tData('phoneMissing')}</span></DefinitionRow> : null}
    </DefinitionList>
  );
}

function SubTitle({ children }: { readonly children: ReactNode }): ReactNode {
  return <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{children}</h3>;
}

/**
 * Account and FHIR card in one panel, each with its own loading and failure. Nothing here is editable: the API has no write
 * for them, so the panel says who changes the data (the front desk) instead of showing a button that would do nothing.
 */
export function ProfilePersonalData(): ReactNode {
  const t = useT('patientProfile.data');
  const tProfile = useT('patient.profile');
  const account = useAccount();
  const patient = usePatientProfile();
  const noCard: boolean = patient.isError && isApiError(patient.error) && errorCodeToUx(patient.error.problem.errorCode).kind === 'not-found';
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="profile-data-title" id="profile-data" className="flex flex-col gap-3.5 p-[22px]">
      <h2 id="profile-data-title" className="text-lg font-bold">{t('title')}</h2>
      <div>
        <SubTitle>{t('account')}</SubTitle>
        {account.data === undefined ? <QueryFailure query={account} embedded pending={<TableSkeleton />} /> : <AccountRows account={account.data} />}
      </div>
      <div>
        <SubTitle>{t('patient')}</SubTitle>
        {patient.data !== undefined ? <PatientRows patient={patient.data} /> : noCard ? <p data-testid="no-patient" className="text-sm text-muted-foreground">{tProfile('noPatient')}</p> : <QueryFailure query={patient} embedded pending={<TableSkeleton />} />}
      </div>
      <p className="text-[13px] leading-normal text-muted-foreground">{t('registryNote')}</p>
    </Card>
  );
}

/** Only documents that exist: the history and prescription pages already have print, and the profile itself prints with the page. */
export function ProfileDocuments(): ReactNode {
  const t = useT('patientProfile.documents');
  const link: string = cn(buttonVariants({ variant: 'ghost' }), 'justify-start');
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="profile-docs-title" className="flex flex-col gap-2 p-[22px]">
      <h2 id="profile-docs-title" className="text-lg font-bold">{t('title')}</h2>
      <Link href="/history" className={link}>{t('history')}</Link>
      <Link href="/prescriptions" className={link}>{t('prescriptions')}</Link>
      <div><PrintButton label={t('print')} /></div>
    </Card>
  );
}
