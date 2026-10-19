jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

// Long typing sequences (hundreds of keystrokes through user-event) take well over 5 s when the machine is busy.
jest.setTimeout(30_000);

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf } from './doctor-test-utils';
import { completeCall, completeRoute, fillRequired, OBSERVATION_SYSTEM, SERVICE_SYSTEM, setup, submit, UCUM } from './encounter-form-test-utils';

describe('EncounterCompleteForm validation', () => {
  it('should not send anything and should mark the fields when the form is empty', async () => {
    setup();

    await submit();

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(completeCall()).toBeUndefined();
  });

  it('should move focus to the summary when the form is empty and submitted', async () => {
    setup();

    await submit();

    await waitFor(() => expect(screen.getByLabelText('Заключение')).toHaveFocus());
  });

  it('should require at least one diagnosis code when only the summary and recommendations are filled', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Заключение'), 'ОРВИ, состояние удовлетворительное');
    await userEvent.type(screen.getByLabelText('Рекомендации'), 'Покой, обильное питьё');

    await submit();

    await waitFor(() => expect(screen.getByLabelText(/Код МКБ-10/)).toHaveFocus());
    expect(completeCall()).toBeUndefined();
  });

  it('should block submission with the ICD-10 message when the code does not match the mask', async () => {
    setup();
    await fillRequired();
    await userEvent.clear(screen.getByLabelText(/Код МКБ-10/));
    await userEvent.type(screen.getByLabelText(/Код МКБ-10/), 'bad');

    await submit();

    expect((await screen.findAllByText(/Некорректный код МКБ-10/)).length).toBeGreaterThan(0);
    expect(completeCall()).toBeUndefined();
  });

  it('should block submission when the summary is shorter than three characters', async () => {
    setup();
    await fillRequired();
    await userEvent.clear(screen.getByLabelText('Заключение'));
    await userEvent.type(screen.getByLabelText('Заключение'), 'ab');

    await submit();

    expect(await screen.findByText('Не короче 3 символов')).toBeInTheDocument();
    expect(completeCall()).toBeUndefined();
  });

  it('should block submission when an observation has no number', async () => {
    setup();
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить наблюдение' }));

    await submit();

    expect(await screen.findByText('Введите число')).toBeInTheDocument();
    expect(completeCall()).toBeUndefined();
  });

  it('should block submission when a drug has an invalid ATC code', async () => {
    setup();
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить лекарство' }));
    await userEvent.type(screen.getByLabelText(/Код АТХ/), 'bad');
    await userEvent.type(screen.getByLabelText(/Дозировка 1/), '1 таб 3 раза в день');

    await submit();

    expect((await screen.findAllByText(/Некорректный код АТХ/)).length).toBeGreaterThan(0);
    expect(completeCall()).toBeUndefined();
  });
});

describe('EncounterCompleteForm observation unit', () => {
  async function addWeightRowWithoutUnit(): Promise<void> {
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить наблюдение' }));
    await userEvent.selectOptions(await screen.findByLabelText(/Показатель 1/), '8310-5');
    await userEvent.type(screen.getByLabelText(/Значение 1/), '70');
  }

  it('should start a new observation row with no unit selected', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Добавить наблюдение' }));

    expect(await screen.findByLabelText(/Единица UCUM 1/)).toHaveValue('');
  });

  it('should not send a measurement and should ask for its unit when the doctor leaves the unit untouched', async () => {
    setup();
    await addWeightRowWithoutUnit();

    await submit();

    expect(await screen.findByText('Поле обязательно для заполнения')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Единица UCUM 1/)).toHaveFocus());
    expect(screen.getByLabelText(/Единица UCUM 1/)).toHaveAttribute('aria-invalid', 'true');
    expect(completeCall()).toBeUndefined();
  });

  it('should send exactly the unit the doctor chose when one is picked', async () => {
    setup();
    await addWeightRowWithoutUnit();
    await userEvent.selectOptions(screen.getByLabelText(/Единица UCUM 1/), 'mg');

    await submit();

    await waitFor(() => expect(completeCall()).toBeDefined());
    expect(bodyOf(completeCall())['observations']).toEqual([{ codeSystem: OBSERVATION_SYSTEM, code: '8310-5', value: 70, unit: 'mg' }]);
  });
});

describe('EncounterCompleteForm submit', () => {
  it('should POST the atomic body with the diagnosis when the required fields are filled', async () => {
    setup();
    await fillRequired();

    await submit();

    await waitFor(() => expect(completeCall()).toBeDefined());
    expect(bodyOf(completeCall())).toEqual({
      summary: 'ОРВИ, состояние удовлетворительное',
      diagnoses: [{ code: 'J06.9', display: 'Острый назофарингит' }],
      recommendations: 'Покой, обильное питьё',
      observations: [],
      serviceRequests: [],
      medicationRequests: [],
    });
  });

  it('should send two diagnoses when a second row is added', async () => {
    setup();
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить диагноз' }));
    await userEvent.type(screen.getByLabelText(/Код МКБ-10 · диагноз 2/), 'K21.0');
    await userEvent.type(screen.getByLabelText(/Название диагноза 2/), 'ГЭРБ');

    await submit();

    await waitFor(() => expect(completeCall()).toBeDefined());
    expect(bodyOf(completeCall())['diagnoses']).toEqual([
      { code: 'J06.9', display: 'Острый назофарингит' },
      { code: 'K21.0', display: 'ГЭРБ' },
    ]);
  });

  it('should send the verification status when the doctor chooses one', async () => {
    setup();
    await fillRequired();
    await userEvent.selectOptions(screen.getByLabelText(/Статус подтверждения 1/), 'confirmed');

    await submit();

    await waitFor(() => expect(completeCall()).toBeDefined());
    expect(bodyOf(completeCall())['diagnoses']).toEqual([{ code: 'J06.9', display: 'Острый назофарингит', verificationStatus: 'confirmed' }]);
  });

  it('should send the observation, the service and the drug of the encounter (scenario C)', async () => {
    setup();
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить наблюдение' }));
    await userEvent.selectOptions(await screen.findByLabelText(/Показатель 1/), '8310-5');
    await userEvent.type(screen.getByLabelText(/Значение 1/), '36.6');
    await userEvent.selectOptions(screen.getByLabelText(/Единица UCUM 1/), 'Cel');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить услугу' }));
    await userEvent.selectOptions(await screen.findByLabelText(/Услуга 1/), 'A01.001');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить лекарство' }));
    await userEvent.type(screen.getByLabelText(/Код АТХ/), 'J01FA10');
    await userEvent.type(screen.getByLabelText(/Дозировка 1/), '1 таб 3 раза в день после еды');

    await submit();

    await waitFor(() => expect(completeCall()).toBeDefined());
    const body = bodyOf(completeCall());
    expect(body['observations']).toEqual([{ codeSystem: OBSERVATION_SYSTEM, code: '8310-5', value: 36.6, unit: 'Cel' }]);
    expect(body['serviceRequests']).toEqual([{ codeSystem: SERVICE_SYSTEM, code: 'A01.001' }]);
    expect(body['medicationRequests']).toEqual([{ atcCode: 'J01FA10', dosageText: '1 таб 3 раза в день после еды' }]);
  });

  it('should remove a diagnosis row but never the last one', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить диагноз' }));
    expect(screen.getAllByLabelText(/Код МКБ-10/)).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить диагноз 1' }));

    expect(screen.getAllByLabelText(/Код МКБ-10/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Удалить диагноз/ })).toBeNull();
  });

  it('should mark the button unavailable and busy while the request is running', async () => {
    let finish: (value: unknown) => void = () => undefined;
    setup(completeRoute(() => new Promise((resolve) => { finish = resolve; })));
    await fillRequired();

    await submit();

    const button = await screen.findByRole('button', { name: 'Завершаем…' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    finish({ id: 'enc-1', status: 'finished' });
  });
});
