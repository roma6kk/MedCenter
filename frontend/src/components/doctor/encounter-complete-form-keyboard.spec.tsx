jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

jest.setTimeout(30_000);

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { callsTo } from './doctor-test-utils';
import { apiFetchMock, COMPLETE, completeCall, completeRoute, DIAGNOSIS_DISPLAY, diagnosisInput, fillRequired, setup, submit } from './encounter-form-test-utils';

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}

describe('EncounterCompleteForm implicit submit', () => {
  it('should not complete the encounter when Enter is pressed in the diagnosis name field', async () => {
    setup();
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить диагноз' }));
    await userEvent.type(diagnosisInput(2), 'K21.0');
    await userEvent.tab();
    await userEvent.type(await screen.findByLabelText(/Название диагноза 2/), 'ГЭРБ');

    await userEvent.keyboard('{Enter}');
    await settle();

    expect(completeCall()).toBeUndefined();
    expect(screen.getByLabelText(/Название диагноза 2/)).toHaveFocus();
  });

  it('should not complete the encounter when Enter is pressed in the dosage field', async () => {
    setup();
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить лекарство' }));
    await userEvent.type(screen.getByLabelText(/Код АТХ/), 'J01FA10');
    await userEvent.type(screen.getByLabelText(/Дозировка 1/), '1 таб 3 раза в день{Enter}');
    await settle();

    expect(completeCall()).toBeUndefined();
  });

  it('should not complete the encounter when Enter is pressed in a code field whose list is open with no active option', async () => {
    setup();
    await fillRequired();
    await userEvent.clear(diagnosisInput());
    await userEvent.type(diagnosisInput(), 'J06');
    await screen.findByRole('option', { name: /J06\.9/ });

    await userEvent.keyboard('{Enter}');
    await settle();

    expect(completeCall()).toBeUndefined();
    expect(diagnosisInput()).toHaveFocus();
  });

  it('should still pick the active option when Enter is pressed in a code list', async () => {
    setup();
    await userEvent.type(diagnosisInput(), 'J06');
    await screen.findByRole('option', { name: /J06\.9/ });

    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(diagnosisInput()).toHaveValue(`J06.9 — ${DIAGNOSIS_DISPLAY}`);
    expect(completeCall()).toBeUndefined();
  });

  it('should keep Enter as a new line in the summary and not complete the encounter', async () => {
    setup();
    await fillRequired();
    await userEvent.type(screen.getByLabelText('Заключение'), '{Enter}Контроль через неделю');
    await settle();

    expect(screen.getByLabelText('Заключение')).toHaveValue('ОРВИ, состояние удовлетворительное\nКонтроль через неделю');
    expect(completeCall()).toBeUndefined();
  });

  it('should complete the encounter when the complete button is activated from the keyboard', async () => {
    setup();
    await fillRequired();
    screen.getByRole('button', { name: 'Завершить приём' }).focus();

    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(completeCall()).toBeDefined());
  });
});

describe('EncounterCompleteForm pending submit', () => {
  it('should send the atomic request once when two presses arrive before the pending state is rendered', async () => {
    let finish: (value: unknown) => void = () => undefined;
    setup(completeRoute(() => new Promise((resolve) => { finish = resolve; })));
    await fillRequired();
    const button = screen.getByRole('button', { name: 'Завершить приём' });

    fireEvent.click(button);
    fireEvent.click(button);
    await settle();

    expect(callsTo(apiFetchMock, COMPLETE, 'POST')).toHaveLength(1);
    finish({ id: 'enc-1', status: 'finished' });
  });

  it('should send the atomic request once and keep focus on the button when it is pressed twice while the request runs', async () => {
    let finish: (value: unknown) => void = () => undefined;
    setup(completeRoute(() => new Promise((resolve) => { finish = resolve; })));
    await fillRequired();
    const button = screen.getByRole('button', { name: 'Завершить приём' });

    await submit();
    const busy = await screen.findByRole('button', { name: 'Завершаем…' });
    await userEvent.click(busy);
    await userEvent.click(busy);
    await settle();

    expect(callsTo(apiFetchMock, COMPLETE, 'POST')).toHaveLength(1);
    expect(busy).toBe(button);
    expect(busy).toHaveFocus();
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    finish({ id: 'enc-1', status: 'finished' });
  });
});
