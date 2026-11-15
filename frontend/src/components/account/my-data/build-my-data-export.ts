import { CLINIC_CONTACTS, CLINIC_LEGAL } from '@/components/catalog/home-content';
import type { PatientConsent } from '@/components/consent/consent-types';
import type { AppointmentView } from '@/components/appointments/appointment-types';
import type { AccountProfile, HistoryEntry, PatientProfile, Prescription } from '@/components/patient/patient-types';
import { clinicDateKey } from '@/lib/clinic-time';
import { createTranslate } from '@/lib/i18n/translate';
import type { Locale } from '@/lib/i18n/locale';
import { POLICY_VERSION } from '@/lib/policy-version';

const PURPOSES: ReadonlyArray<string> = ['Account', 'Booking', 'Clinic', 'Security'];

export interface MyDataSources {
  readonly account: AccountProfile;
  readonly patient: PatientProfile;
  readonly consent: PatientConsent;
  readonly appointments: ReadonlyArray<AppointmentView>;
  readonly encounters: ReadonlyArray<HistoryEntry>;
  readonly prescriptions: ReadonlyArray<Prescription>;
}

interface ProcessingInformation {
  readonly legalBasis: string;
  readonly operator: {
    readonly name: string;
    readonly unp: string;
    readonly address: string;
    readonly email: string;
    readonly phone: string;
    readonly note: string;
  };
  readonly purposes: ReadonlyArray<{ readonly title: string; readonly data: string; readonly legalBasis: string }>;
  readonly consent: {
    readonly accountConsentAt: string | null;
    readonly accountConsentTextVersion: string | null;
    readonly currentPolicyVersion: string;
  };
  readonly retention: string;
  readonly authorisedPersons: string;
  readonly fullInformation: string;
}

export interface MyDataExport extends MyDataSources {
  readonly format: 'medcenter-my-data';
  readonly formatVersion: 1;
  readonly generatedAt: string;
  readonly information: ProcessingInformation;
}

export function myDataFileName(now: Date): string {
  return `medcenter-my-data-${clinicDateKey(now)}.json`;
}

function informationOf(account: AccountProfile, locale: Locale): ProcessingInformation {
  const t = createTranslate(locale, 'myData');
  const privacy = createTranslate(locale, 'privacy');
  const home = createTranslate(locale, 'home');
  return {
    legalBasis: t('infoLegalBasis'),
    operator: { name: CLINIC_LEGAL.name, unp: CLINIC_LEGAL.unp, address: home('contactAddressValue'), email: CLINIC_CONTACTS.email, phone: CLINIC_CONTACTS.phone, note: t('infoOperatorNote') },
    purposes: PURPOSES.map((id) => ({ title: privacy(`purpose${id}Title`), data: privacy(`purpose${id}Data`), legalBasis: privacy(`purpose${id}Basis`) })),
    consent: {
      accountConsentAt: account.accountConsent?.at ?? null,
      accountConsentTextVersion: account.accountConsent?.version ?? null,
      currentPolicyVersion: POLICY_VERSION,
    },
    retention: t('infoRetention'),
    authorisedPersons: t('infoAuthorised'),
    fullInformation: t('infoFullRequest'),
  };
}

export function buildMyDataExport(sources: MyDataSources, locale: Locale, now: Date): MyDataExport {
  return {
    format: 'medcenter-my-data',
    formatVersion: 1,
    generatedAt: now.toISOString(),
    information: informationOf(sources.account, locale),
    ...sources,
  };
}
