/** consent-fixtures — consent answers shared by the specs of the consent screens (never imported by application code). */
import type { ConsentRecord, PatientConsent } from './consent-types';

export const ACTIVE_RECORD: ConsentRecord = {
  id: 'c-active',
  status: 'active',
  formNumber: 'Ф-12',
  signedAt: '2026-10-20',
  consenterType: 'self',
  performer: { type: 'Patient', id: 'p1' },
  signedBy: 'Петрова А. И.',
  scan: { id: 'scan-1', contentType: 'application/pdf', hash: 'h1' },
  period: { start: '2026-10-20' },
  recordedAt: '2026-10-20T09:00:00Z',
};

export const REVOKED_RECORD: ConsentRecord = {
  ...ACTIVE_RECORD,
  id: 'c-old',
  status: 'inactive',
  formNumber: 'Ф-3',
  signedAt: '2026-01-10',
  scan: { id: 'scan-0', contentType: 'image/png', hash: 'h0' },
  period: { start: '2026-01-10', end: '2026-09-01' },
  revocationNumber: 'З-77',
};

export const REJECTED_RECORD: ConsentRecord = { ...ACTIVE_RECORD, id: 'c-rej', status: 'rejected', formNumber: 'О-5', period: { start: '2026-10-20' } };

export const WITH_ACTIVE: PatientConsent = { active: ACTIVE_RECORD, history: [ACTIVE_RECORD, REVOKED_RECORD] };
export const NONE: PatientConsent = { active: null, history: [] };
export const REVOKED: PatientConsent = { active: null, history: [REVOKED_RECORD] };
export const REJECTED: PatientConsent = { active: null, history: [REJECTED_RECORD] };
