/**
 * encounter-form-defaults — the empty row each list of the completion form starts a new entry with.
 * Kept out of the editor components: a file that exports both a component and a value breaks React Fast Refresh.
 */
import { OBSERVATION_CODE_SYSTEM_DEFAULT, SERVICE_CODE_SYSTEM_DEFAULT, type CompleteEncounterForm } from '@/lib/contracts';

export const EMPTY_DIAGNOSIS: CompleteEncounterForm['diagnoses'][number] = { code: '', display: '' };

/**
 * A new observation row has no unit: the seeded concepts are measured in different units (kg, cm, mm[Hg], /min, %, Cel), so any
 * preset would silently store a wrong clinical record for most of them. The `required` rule of the form forces an explicit choice.
 */
export const EMPTY_OBSERVATION: CompleteEncounterForm['observations'][number] = {
  codeSystem: OBSERVATION_CODE_SYSTEM_DEFAULT,
  code: '',
  value: Number.NaN,
  unit: '',
};

export const EMPTY_SERVICE: CompleteEncounterForm['serviceRequests'][number] = { codeSystem: SERVICE_CODE_SYSTEM_DEFAULT, code: '' };

export const EMPTY_MEDICATION: CompleteEncounterForm['medicationRequests'][number] = { atcCode: '', dosageText: '' };
