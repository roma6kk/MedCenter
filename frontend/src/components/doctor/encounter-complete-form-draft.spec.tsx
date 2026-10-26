jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

// Long typing sequences (hundreds of keystrokes through user-event) take well over 5 s when the machine is busy.
jest.setTimeout(30_000);

import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CompleteEncounterForm } from '@/lib/contracts';
import { readDraft } from '@/lib/encounter-draft';
import { completeCall, completeRoute, diagnosisInput, fillRequired, setup, submit } from './encounter-form-test-utils';
import { AUTOSAVE_DELAY_MS } from './use-encounter-draft';

const FILLED: CompleteEncounterForm = {
  summary: 'ОРВИ, состояние удовлетворительное',
  diagnoses: [{ code: 'J06.9', display: 'Острая инфекция верхних дыхательных путей неуточнённая' }],
  recommendations: 'Покой',
  observations: [],
  serviceRequests: [],
  medicationRequests: [],
};

describe('EncounterCompleteForm draft (A8)', () => {
  it('should say there is no draft yet before anything is typed', () => {
    setup();

    expect(screen.getByText('Черновик ещё не создан')).toBeInTheDocument();
  });

  it('should save the draft after a pause in typing and say when', async () => {
    setup();

    await userEvent.type(screen.getByLabelText('Заключение'), 'ОРВИ');

    expect(screen.getByText('Черновик ещё не сохранён')).toBeInTheDocument();
    expect(await screen.findByText(/Черновик сохранён \d{2}:\d{2} · на этом устройстве/, undefined, { timeout: AUTOSAVE_DELAY_MS + 2000 })).toBeInTheDocument();
    expect(readDraft('enc-1')?.values.summary).toBe('ОРВИ');
  });

  it('should save at once when «Сохранить черновик» is pressed', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Заключение'), 'ОРВИ');

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));

    expect(readDraft('enc-1')?.values.summary).toBe('ОРВИ');
    expect(screen.getByText(/Черновик сохранён/)).toBeInTheDocument();
  });
});

describe('EncounterCompleteForm restored draft', () => {
  const renderWithStoredDraft = (): void => setup(completeRoute(), FILLED);

  it('should fill the form from the draft and say when it was saved', async () => {
    renderWithStoredDraft();

    expect(await screen.findByTestId('draft-restored')).toHaveTextContent(/Восстановлен черновик от/);
    expect(screen.getByLabelText('Заключение')).toHaveValue(FILLED.summary);
    expect(diagnosisInput()).toHaveValue('J06.9 — Острая инфекция верхних дыхательных путей неуточнённая');
    expect(screen.getByLabelText('Рекомендации')).toHaveValue('Покой');
  });

  it('should hide the notice and keep the text when it is dismissed', async () => {
    renderWithStoredDraft();

    await userEvent.click(await screen.findByRole('button', { name: 'Скрыть' }));

    expect(screen.queryByTestId('draft-restored')).toBeNull();
    expect(screen.getByLabelText('Заключение')).toHaveValue(FILLED.summary);
  });

  it('should empty the form and forget the draft when the doctor starts over', async () => {
    renderWithStoredDraft();

    await userEvent.click(await screen.findByRole('button', { name: 'Начать заново' }));

    expect(screen.getByLabelText('Заключение')).toHaveValue('');
    expect(diagnosisInput()).toHaveValue('');
    expect(screen.queryByTestId('draft-restored')).toBeNull();
    expect(readDraft('enc-1')).toBeNull();
  });

  it('should send the restored text when the visit is completed', async () => {
    renderWithStoredDraft();
    await screen.findByTestId('draft-restored');

    await submit();

    await waitFor(() => expect(completeCall()).toBeDefined());
    expect(JSON.parse(String(completeCall()?.[1]?.body))).toMatchObject({ summary: FILLED.summary, recommendations: 'Покой' });
  });
});

describe('EncounterCompleteForm draft after completion', () => {
  it('should forget the draft once the visit is completed, and not write it again when the form goes away', async () => {
    setup(completeRoute());
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
    expect(readDraft('enc-1')).not.toBeNull();

    await submit();

    await waitFor(() => expect(completeCall()).toBeDefined());
    await waitFor(() => expect(readDraft('enc-1')).toBeNull());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 200));
    });
    expect(readDraft('enc-1')).toBeNull();
  });

  it('should keep the draft when the server refuses the completion', async () => {
    setup(completeRoute(() => { throw new Error('offline'); }));
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));

    await submit();

    await waitFor(() => expect(completeCall()).toBeDefined());
    expect(readDraft('enc-1')).not.toBeNull();
  });
});

describe('EncounterCompleteForm leaving the page (A8)', () => {
  afterEach(() => jest.restoreAllMocks());

  function leave(): Event {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event;
  }

  it('should not warn when the text is safely in the draft', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Заключение'), 'ОРВИ');

    const event = leave();

    // The draft is written on the way out, so there is nothing to lose and nothing to ask.
    expect(event.defaultPrevented).toBe(false);
    expect(readDraft('enc-1')?.values.summary).toBe('ОРВИ');
  });

  it('should warn when the browser refuses to keep the draft', async () => {
    setup();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await userEvent.type(screen.getByLabelText('Заключение'), 'ОРВИ');

    const event = leave();

    expect(event.defaultPrevented).toBe(true);
  });

  it('should say the draft is not being saved when storage is unavailable', async () => {
    setup();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    await userEvent.type(screen.getByLabelText('Заключение'), 'ОРВИ');

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));

    expect(screen.getByText('Черновик не сохраняется: хранилище браузера недоступно')).toBeInTheDocument();
  });

  it('should not warn when nothing was typed', () => {
    setup();

    expect(leave().defaultPrevented).toBe(false);
  });
});
