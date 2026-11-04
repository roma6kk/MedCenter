jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

// Long typing sequences (hundreds of keystrokes through user-event) take well over 5 s when the machine is busy.
jest.setTimeout(30_000);

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { problem } from './doctor-test-utils';
import { completeCall, completeRoute, DIAGNOSIS_DISPLAY, diagnosisInput, fillRequired, pickDiagnosis, setup, submit } from './encounter-form-test-utils';

describe('EncounterCompleteForm server errors', () => {
  it('should mark the rejected diagnosis code and focus it when the server answers INVALID_ICD10_CODE', async () => {
    setup(completeRoute(() => { throw problem(422, 'INVALID_ICD10_CODE', 'INVALID_ICD10_CODE: not in https://fhir.by/ValueSet/InternClassificDiseases10: J06.9'); }));
    await fillRequired();

    await submit();

    expect(await screen.findByText('Код не входит в справочник МКБ-10')).toBeInTheDocument();
    await waitFor(() => expect(diagnosisInput()).toHaveFocus());
    expect(diagnosisInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('should mark the drug code when the server answers TERMINOLOGY_NOT_FOUND for it', async () => {
    setup(completeRoute(() => { throw problem(422, 'TERMINOLOGY_NOT_FOUND', 'TERMINOLOGY_NOT_FOUND: not in the terminology seed: http://www.whocc.no/atc#J01FA10'); }));
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить лекарство' }));
    await userEvent.type(screen.getByLabelText(/Код АТХ/), 'J01FA10');
    await userEvent.type(screen.getByLabelText(/Дозировка 1/), '1 таб 3 раза в день');

    await submit();

    expect(await screen.findByText('Код АТХ не найден в справочнике')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Код АТХ/)).toHaveFocus());
  });

  it('should put the server message under the field and the foreign ones into the banner when a VALIDATION_ERROR carries details', async () => {
    const details = [
      { field: 'diagnoses.0.display', message: 'display must be shorter than or equal to 500 characters' },
      { field: 'patientId', message: 'patientId is not allowed' },
    ];
    setup(completeRoute(() => { throw problem(400, 'VALIDATION_ERROR', undefined, details); }));
    await fillRequired();

    await submit();

    // The name is derived from the code and has no field of its own until the server marks it: then it appears, marked.
    expect(await screen.findByText('Слишком длинное значение')).toBeInTheDocument();
    expect(screen.getByLabelText(/Название диагноза 1/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('problem-banner')).toHaveTextContent('patientId is not allowed');
  });

  it('should focus the first field the server names when a VALIDATION_ERROR carries details', async () => {
    const details = [
      { field: 'recommendations', message: 'recommendations must be longer than or equal to 3 characters' },
      { field: 'diagnoses.0.display', message: 'display must be shorter than or equal to 500 characters' },
    ];
    setup(completeRoute(() => { throw problem(400, 'VALIDATION_ERROR', undefined, details); }));
    await fillRequired();

    await submit();

    await waitFor(() => expect(screen.getByLabelText(/Название диагноза 1/)).toHaveFocus());
  });

  it('should show the conflict banner with its code when the encounter was already completed', async () => {
    setup(completeRoute(() => { throw problem(409, 'ENCOUNTER_STATE_INVALID', 'encounter is already finished'); }));
    await fillRequired();

    await submit();

    expect(await screen.findByText('Приём уже оформлен')).toBeInTheDocument();
    expect(screen.getByText('ENCOUNTER_STATE_INVALID')).toBeInTheDocument();
  });
});

describe('EncounterCompleteForm focus of added rows', () => {
  it('should focus the code select of a new observation row, not its value input', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Добавить наблюдение' }));

    await waitFor(() => expect(screen.getByLabelText(/Показатель 1/)).toHaveFocus());
  });

  it('should focus the code field of a new diagnosis row', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Добавить диагноз' }));

    await waitFor(() => expect(diagnosisInput(2)).toHaveFocus());
  });

  it('should keep the focus in the list after a diagnosis row is removed', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить диагноз' }));
    await waitFor(() => expect(diagnosisInput(2)).toHaveFocus());

    await userEvent.click(screen.getByRole('button', { name: 'Удалить диагноз 2' }));

    await waitFor(() => expect(diagnosisInput(1)).toHaveFocus());
  });

  it('should move the focus to the section heading when the last row of a list is removed', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить лекарство' }));

    await userEvent.click(await screen.findByRole('button', { name: /Удалить лекарство/ }));

    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('encounter-section-medications-title')));
  });

  it('should focus the code field of a new drug row', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Добавить лекарство' }));

    await waitFor(() => expect(screen.getByLabelText(/Код АТХ/)).toHaveFocus());
  });

  it('should focus the code select of a new service row', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Добавить услугу' }));

    await waitFor(() => expect(screen.getByLabelText(/Услуга 1/)).toHaveFocus());
  });

  it('should fill the name from the terminology when a full code is typed and the field is left', async () => {
    setup();

    await userEvent.type(diagnosisInput(), 'J06.9');
    await userEvent.tab();

    await waitFor(() => expect(diagnosisInput()).toHaveValue(`J06.9 — ${DIAGNOSIS_DISPLAY}`));
    expect(screen.queryByLabelText(/Название диагноза 1/)).toBeNull();
  });

  it('should ask for the name by hand when the typed code is not in the value set', async () => {
    setup();

    await userEvent.type(diagnosisInput(), 'Q99.9');
    await userEvent.tab();

    expect(await screen.findByLabelText(/Название диагноза 1/)).toHaveValue('');
    expect(screen.getByText(/Справочник не вернул название/)).toBeInTheDocument();
  });

  it('should keep the name field while the doctor types the name of an unknown code', async () => {
    setup();
    await userEvent.type(diagnosisInput(), 'Q99.9');
    await userEvent.tab();

    await userEvent.type(await screen.findByLabelText(/Название диагноза 1/), 'Редкий случай');

    expect(screen.getByLabelText(/Название диагноза 1/)).toHaveValue('Редкий случай');
  });

  it('should treat editing a chosen diagnosis as a new search: no code is sent until another one is picked', async () => {
    setup();
    await fillRequired();

    await userEvent.type(diagnosisInput(), '{Backspace}');
    expect(diagnosisInput()).toHaveValue('');
    await userEvent.type(diagnosisInput(), 'ОРВИ');
    await submit();

    expect(diagnosisInput()).toHaveValue('ОРВИ');
    expect((await screen.findAllByText(/Некорректный код МКБ-10/)).length).toBeGreaterThan(0);
    expect(completeCall()).toBeUndefined();
    expect(screen.queryByLabelText(/Название диагноза 1/)).toBeNull();
  });
});
