'use client';

import type { ReactNode } from 'react';
import { TableSkeleton } from '@/components/feedback/states';
import { isApiError } from '@/lib/api/api-fetch';
import { errorCodeToUx } from '@/lib/api/error-code-map';
import type { Translate } from '@/lib/i18n/translate';
import { useT } from '@/lib/i18n/use-t';
import { DefinitionList, DefinitionRow } from './definition-list';
import type { AccountProfile, ContactPoint, PatientProfile } from './patient-types';
import { QueryErrorState } from './query-error-state';
import { useClinicFormat } from './use-clinic-format';
import { useDocumentTitle } from './use-document-title';
import { useAccount, usePatientProfile } from './use-patient-queries';

const GENDER_KEYS: Readonly<Record<string, string>> = { male: 'genderMale', female: 'genderFemale', other: 'genderOther' };
const CONTACT_KEYS: Readonly<Record<string, string>> = { email: 'contactEmail', phone: 'contactPhone' };

function ProfileSection({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }): ReactNode {
  return (
    <section aria-labelledby={id} className="mt-6">
      <h2 id={id} className="serif text-xl font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function AccountRows({ account }: { readonly account: AccountProfile }): ReactNode {
  const t = useT('patient.profile');
  const format = useClinicFormat();
  return (
    <DefinitionList>
      <DefinitionRow label={t('name')}>{account.name ?? `${account.lastName} ${account.firstName}`}</DefinitionRow>
      <DefinitionRow label={t('email')}>{account.email}</DefinitionRow>
      <DefinitionRow label={t('status')}>{account.isActive ? t('active') : t('inactive')}</DefinitionRow>
      {account.createdAt ? <DefinitionRow label={t('registered')}>{format.date(account.createdAt)}</DefinitionRow> : null}
    </DefinitionList>
  );
}

/** `Email`, `Телефон`, or the raw FHIR system name for a kind of contact the cabinet has no word for. */
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
          <li key={`${contact.system}-${contact.value}`}><span className="text-[var(--muted-foreground)]">{contactLabel(t, contact.system)}: </span>{contact.value}</li>
        ))}
      </ul>
    </DefinitionRow>
  );
}

function PatientRows({ patient }: { readonly patient: PatientProfile }): ReactNode {
  const t = useT('patient.profile');
  const format = useClinicFormat();
  const fullName: string = patient.fullName === '' ? [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(' ') : patient.fullName;
  return (
    <DefinitionList>
      <DefinitionRow label={t('name')}>{fullName}</DefinitionRow>
      {patient.birthDate ? <DefinitionRow label={t('birthDate')}>{format.dateOnly(patient.birthDate)}</DefinitionRow> : null}
      <DefinitionRow label={t('gender')}>{t(GENDER_KEYS[patient.gender ?? ''] ?? 'genderUnknown')}</DefinitionRow>
      <ContactRows contacts={patient.telecom} />
    </DefinitionList>
  );
}

function AccountCard(): ReactNode {
  const query = useAccount();
  if (query.isPending) return <TableSkeleton />;
  if (query.data === undefined) return <QueryErrorState error={query.error} embedded onRetry={() => void query.refetch()} />;
  return <AccountRows account={query.data} />;
}

/** A patient who has no FHIR card yet (404) is a normal state of a new account, not an error screen. */
function PatientCard(): ReactNode {
  const t = useT('patient.profile');
  const query = usePatientProfile();
  if (query.isPending) return <TableSkeleton />;
  if (query.data !== undefined) return <PatientRows patient={query.data} />;
  if (isApiError(query.error) && errorCodeToUx(query.error.problem.errorCode).kind === 'not-found') {
    return <p data-testid="no-patient" className="text-sm text-[var(--muted-foreground)]">{t('noPatient')}</p>;
  }
  return <QueryErrorState error={query.error} embedded onRetry={() => void query.refetch()} />;
}

/** The patient's own profile (FR-001): the account (API 2.2.7) and the FHIR patient card (API 3.1), read-only. */
export function ProfileView(): ReactNode {
  const t = useT('patient.profile');
  const tBrand = useT('layout');
  useDocumentTitle(t('title'), tBrand('brand'));
  return (
    <div>
      <h1 className="serif text-2xl font-bold">{t('title')}</h1>
      <ProfileSection id="profile-account" title={t('accountTitle')}><AccountCard /></ProfileSection>
      <ProfileSection id="profile-patient" title={t('patientTitle')}><PatientCard /></ProfileSection>
      <p className="mt-4 text-sm text-[var(--muted-foreground)]">{t('readOnly')}</p>
    </div>
  );
}
