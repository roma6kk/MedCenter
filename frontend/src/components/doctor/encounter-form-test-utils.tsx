/**
 * encounter-form-test-utils — shared fixtures and steps of the `EncounterCompleteForm` specs (never imported by application code).
 * The spec that imports it must `jest.mock('@/lib/api/api-fetch', …)` first: the helpers drive that mocked `apiFetch`.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import type { CompleteEncounterForm } from '@/lib/contracts';
import { writeDraft } from '@/lib/encounter-draft';
import { callsTo, renderWithClient, routeApi, type ApiCall, type ApiMock, type ApiRoute } from './doctor-test-utils';
import { EncounterCompleteForm } from './encounter-complete-form';

export const apiFetchMock = apiFetch as ApiMock;
export const COMPLETE = '/api/v1/encounters/enc-1/complete';
export const OBSERVATION_SYSTEM = 'https://fhir.by/CodeSystem/nsi-observations';
export const SERVICE_SYSTEM = 'https://fhir.by/CodeSystem/nsi-services';
export const UCUM = 'http://unitsofmeasure.org';
export const DIAGNOSIS_DISPLAY = 'Острая инфекция верхних дыхательных путей неуточнённая';

export function expansion(path: string): unknown {
  if (path.includes('InternClassificDiseases10')) return { valueSet: 'icd', total: 1, items: [{ system: 'https://fhir.by/CodeSystem/InternClassificDiseases10', code: 'J06.9', display: DIAGNOSIS_DISPLAY }] };
  if (path.includes('nsi-observations')) return { valueSet: 'obs', total: 1, items: [{ system: OBSERVATION_SYSTEM, code: '8310-5', display: 'Температура тела' }] };
  if (path.includes('nsi-services')) return { valueSet: 'srv', total: 1, items: [{ system: SERVICE_SYSTEM, code: 'A01.001', display: 'Консультация' }] };
  if (path.includes('ucum')) return { valueSet: 'ucum', total: 2, items: [{ system: UCUM, code: 'Cel', display: 'градус Цельсия' }, { system: UCUM, code: 'mg', display: 'миллиграмм' }] };
  return { valueSet: 'other', total: 0, items: [] };
}

export function completeRoute(respond: ApiRoute['respond'] = () => ({ id: 'enc-1', status: 'finished' })): ApiRoute {
  return { method: 'POST', path: COMPLETE, respond };
}

export function setup(complete: ApiRoute = completeRoute(), draft?: CompleteEncounterForm): void {
  apiFetchMock.mockReset();
  // A draft kept by an earlier test would be restored into this form.
  window.localStorage.clear();
  // A draft the test wants the form to open with is stored after the clean-up and before the form reads it.
  if (draft !== undefined) writeDraft('enc-1', draft);
  routeApi(apiFetchMock, [
    { path: '/api/v1/terminology/expand', respond: expansion },
    // The patient's earlier diagnoses (shortcuts of the diagnosis field): none here.
    { path: '/api/v1/patients/p-1/history', respond: () => ({ items: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }) },
    complete,
  ]);
  renderWithClient(<EncounterCompleteForm encounterId="enc-1" patientId="p-1" />);
}

export function completeCall(): ApiCall | undefined {
  return callsTo(apiFetchMock, COMPLETE, 'POST')[0];
}

/** The text field of the n-th diagnosis row: one combobox for the code or the name. */
export const diagnosisInput = (n: number = 1): HTMLElement => screen.getByLabelText(new RegExp(`Диагноз ${n}:`));

/** Searches the terminology by what is typed and picks the J06.9 suggestion: the way a doctor fills the diagnosis. */
export async function pickDiagnosis(n: number = 1, query: string = 'J06'): Promise<void> {
  await userEvent.type(diagnosisInput(n), query);
  await userEvent.click(await screen.findByRole('option', { name: /J06\.9/ }));
}

export async function fillRequired(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Заключение'), 'ОРВИ, состояние удовлетворительное');
  await pickDiagnosis();
  await userEvent.type(screen.getByLabelText('Рекомендации'), 'Покой, обильное питьё');
}

export const submit = (): Promise<void> => userEvent.click(screen.getByRole('button', { name: 'Завершить приём' }));
