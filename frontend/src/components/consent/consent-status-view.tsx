'use client';

import type { ReactNode } from 'react';
import { StampBadge, type StampStatus } from '@/components/feedback/stamp-badge';
import { WRAP_TEXT } from '@/components/patient/wrap-text';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import { consentStateOf, type ConsentRecord, type ConsentState, type PatientConsent } from './consent-types';
import { ScanDownloadButton } from './scan-download-button';

const STAMP_OF: Readonly<Record<ConsentRecord['status'], StampStatus>> = {
  active: 'active',
  inactive: 'cancelled',
  rejected: 'noshow',
  'entered-in-error': 'entered-in-error',
};

/** The record the headline describes: the one in force, else the newest entry that was not a mistake. */
function headlineRecord(consent: PatientConsent): ConsentRecord | null {
  return consent.active ?? consent.history.find((entry) => entry.status !== 'entered-in-error') ?? null;
}

function EntryFacts({ record }: { readonly record: ConsentRecord }): ReactNode {
  const t = useT('consent.view');
  const format = useClinicFormat();
  const signer: string | undefined = record.consenterType === undefined || record.consenterType === 'self' ? undefined : t(`consenterTypes.${record.consenterType}`);
  return (
    <ul className="mt-1 grid gap-0.5 text-sm text-muted-foreground">
      {record.formNumber === undefined ? null : <li>{t('formNumber', { number: record.formNumber })}</li>}
      <li>{t('signedAt', { date: format.date(record.signedAt) })}</li>
      {signer === undefined ? null : <li>{`${t('consenter')}: ${signer}`}</li>}
      {record.representativeDocument === undefined ? null : <li>{t('representativeDocument', { document: record.representativeDocument })}</li>}
      {record.signedBy === undefined ? null : <li>{t('signedBy', { name: record.signedBy })}</li>}
      {record.period.end === undefined ? null : <li>{t('until', { date: format.date(record.period.end) })}</li>}
      {record.revocationNumber === undefined ? null : <li>{t('revocationNumber', { number: record.revocationNumber })}</li>}
    </ul>
  );
}

function HistoryEntry({ record, scanOfPatient }: { readonly record: ConsentRecord; readonly scanOfPatient: string | undefined }): ReactNode {
  const t = useT('consent');
  return (
    <li className={`rounded-card border border-border bg-card p-3 ${WRAP_TEXT}`}>
      <StampBadge status={STAMP_OF[record.status]}>{t(`status.${record.status}`)}</StampBadge>
      <EntryFacts record={record} />
      {scanOfPatient !== undefined && record.scan !== undefined ? (
        <div className="mt-2"><ScanDownloadButton patientId={scanOfPatient} scan={record.scan} formNumber={record.formNumber} /></div>
      ) : null}
    </li>
  );
}

interface ConsentStatusViewProps {
  readonly consent: PatientConsent;
  /** Staff read the scan: give the patient the consent belongs to and each entry offers its download. The patient themselves do not. */
  readonly scanOfPatient?: string;
}

/** Where the patient's consent stands (active, revoked, refused, none) with the facts of the entry in question and the whole history. */
export function ConsentStatusView({ consent, scanOfPatient }: ConsentStatusViewProps): ReactNode {
  const t = useT('consent');
  const state: ConsentState = consentStateOf(consent);
  const record: ConsentRecord | null = headlineRecord(consent);
  return (
    <div>
      <div role="status" data-testid={`consent-state-${state}`}>
        <p className="font-semibold">{t(`state.${state}`)}</p>
        {record === null ? null : <EntryFacts record={record} />}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-muted-foreground">{t('view.historyTitle')}</h3>
      {consent.history.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{t('view.historyEmpty')}</p>
      ) : (
        <ul aria-label={t('view.historyTitle')} className="mt-2 grid gap-2">
          {consent.history.map((entry) => <HistoryEntry key={entry.id} record={entry} scanOfPatient={scanOfPatient} />)}
        </ul>
      )}
    </div>
  );
}
