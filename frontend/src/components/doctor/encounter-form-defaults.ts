import { OBSERVATION_CODE_SYSTEM_DEFAULT, SERVICE_CODE_SYSTEM_DEFAULT, type CompleteEncounterForm } from '@/lib/contracts';

export const EMPTY_DIAGNOSIS: CompleteEncounterForm['diagnoses'][number] = { code: '', display: '' };

export const EMPTY_OBSERVATION: CompleteEncounterForm['observations'][number] = {
  codeSystem: OBSERVATION_CODE_SYSTEM_DEFAULT,
  code: '',
  value: Number.NaN,
  unit: '',
};

export const EMPTY_SERVICE: CompleteEncounterForm['serviceRequests'][number] = { codeSystem: SERVICE_CODE_SYSTEM_DEFAULT, code: '' };

export const EMPTY_MEDICATION: CompleteEncounterForm['medicationRequests'][number] = { atcCode: '', dosageText: '' };
