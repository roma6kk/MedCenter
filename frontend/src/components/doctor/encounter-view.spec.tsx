jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

// Long typing sequences (hundreds of keystrokes through user-event) take well over 5 s when the machine is busy.
jest.setTimeout(30_000);

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { createAppQueryClient } from '@/lib/api/query-client';
import { encounter, FINISHED_CONTENT, problem, renderWithClient, routeApi, type ApiMock, type ApiRoute } from './doctor-test-utils';
import { EncounterView } from './encounter-view';
import type { EncounterDetails } from './doctor-types';

const apiFetchMock = apiFetch as ApiMock;
const PATIENT: ApiRoute = { path: '/api/v1/patients/p1', respond: () => ({ id: 'p1', active: true, fullName: 'Кузнецов Алексей Иванович', lastName: 'Кузнецов', firstName: 'Алексей', telecom: [] }) };
const EXPANSION: ApiRoute = { path: '/api/v1/terminology/expand', respond: () => ({ valueSet: 'x', total: 0, items: [] }) };

function encounterRoute(respond: () => EncounterDetails): ApiRoute {
  return { path: '/api/v1/encounters/enc-1', respond };
}

function setup(routes: ReadonlyArray<ApiRoute>): void {
  apiFetchMock.mockReset();
  routeApi(apiFetchMock, [PATIENT, EXPANSION, ...routes]);
  renderWithClient(<EncounterView encounterId="enc-1" />, createAppQueryClient());
}

describe('EncounterView', () => {
  it('should show the completion form when the encounter is in progress', async () => {
    setup([encounterRoute(() => encounter())]);

    expect(await screen.findByRole('form', { name: 'Оформление приёма' })).toBeInTheDocument();
    expect(screen.queryByTestId('encounter-readonly')).toBeNull();
  });

  it('should show the patient name as a link to the card and the service when the encounter loads', async () => {
    setup([encounterRoute(() => encounter())]);

    expect(await screen.findByRole('link', { name: 'Кузнецов Алексей Иванович' })).toHaveAttribute('href', '/patients/p1');
    expect(screen.getByText('Консультация терапевта')).toBeInTheDocument();
  });

  it('should show the stored clinical content read-only when the encounter is finished', async () => {
    setup([encounterRoute(() => encounter(FINISHED_CONTENT))]);

    const record = await screen.findByTestId('encounter-record');

    expect(screen.queryByRole('form', { name: 'Оформление приёма' })).toBeNull();
    expect(screen.getByTestId('encounter-readonly')).toHaveTextContent('Приём завершён');
    expect(within(record).getByText('ОРВИ, состояние удовлетворительное')).toBeInTheDocument();
    expect(within(record).getByText('J06.9')).toBeInTheDocument();
    expect(within(record).getByText('Острый назофарингит')).toBeInTheDocument();
    expect(within(record).getByText('Температура тела')).toBeInTheDocument();
    expect(within(record).getByText('36.6')).toBeInTheDocument();
    expect(within(record).getByText('Cel')).toBeInTheDocument();
    expect(within(record).getByText('J01FA10')).toBeInTheDocument();
    expect(within(record).getByText('Азитромицин')).toBeInTheDocument();
    expect(within(record).getByText('1 таб 3 раза в день')).toBeInTheDocument();
    expect(within(record).getByText('Покой, обильное питьё')).toBeInTheDocument();
  });

  it('should spell out an empty section when the finished encounter has no observations', async () => {
    setup([encounterRoute(() => encounter({ ...FINISHED_CONTENT, observations: [], serviceRequests: [], medicationRequests: [] }))]);

    const record = await screen.findByTestId('encounter-record');

    expect(within(record).getByText('Наблюдения не добавлены')).toBeInTheDocument();
    expect(within(record).getByText('Услуги не назначены')).toBeInTheDocument();
    expect(within(record).getByText('Лекарства не назначены')).toBeInTheDocument();
  });

  it('should say the encounter cannot be completed when it is neither in progress nor finished', async () => {
    setup([encounterRoute(() => encounter({ status: 'cancelled' }))]);

    expect(await screen.findByText(/оформить нельзя/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Оформление приёма' })).toBeNull();
  });

  it('should show the not-found state when the service answers 404', async () => {
    setup([{ path: '/api/v1/encounters/enc-1', respond: () => { throw problem(404, 'NOT_FOUND'); } }]);

    expect(await screen.findByText('Приём не найден')).toBeInTheDocument();
  });

  it('should look the same as not found when the encounter belongs to another doctor (COMPARTMENT_VIOLATION)', async () => {
    setup([{ path: '/api/v1/encounters/enc-1', respond: () => { throw problem(403, 'COMPARTMENT_VIOLATION'); } }]);

    expect(await screen.findByText('Приём не найден')).toBeInTheDocument();
  });

  it('should show a banner with a retry button when the service fails', async () => {
    setup([{ path: '/api/v1/encounters/enc-1', respond: () => { throw problem(500, 'INTERNAL'); } }]);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('Внутренняя ошибка');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});

describe('EncounterView replay of a completed encounter (scenario C2)', () => {
  it('should turn into the read-only record when completing answers 409 ENCOUNTER_STATE_INVALID', async () => {
    let isFinished = false;
    setup([
      { path: '/api/v1/encounters/enc-1/complete', method: 'POST', respond: () => { isFinished = true; throw problem(409, 'ENCOUNTER_STATE_INVALID'); } },
      encounterRoute(() => encounter(isFinished ? FINISHED_CONTENT : {})),
    ]);
    await userEvent.type(await screen.findByLabelText('Заключение'), 'ОРВИ, состояние удовлетворительное');
    await userEvent.type(screen.getByLabelText(/Код МКБ-10/), 'J06.9');
    await userEvent.type(screen.getByLabelText(/Название диагноза 1/), 'Острый назофарингит');
    await userEvent.type(screen.getByLabelText('Рекомендации'), 'Покой, обильное питьё');

    await userEvent.click(screen.getByRole('button', { name: 'Завершить приём' }));

    expect(await screen.findByTestId('encounter-record')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Оформление приёма' })).toBeNull());
    expect(screen.getByTestId('encounter-readonly')).toBeInTheDocument();
  });

  it('should turn into the read-only record after a successful completion', async () => {
    let isFinished = false;
    setup([
      { path: '/api/v1/encounters/enc-1/complete', method: 'POST', respond: () => { isFinished = true; return { id: 'enc-1', status: 'finished' }; } },
      encounterRoute(() => encounter(isFinished ? FINISHED_CONTENT : {})),
    ]);
    await userEvent.type(await screen.findByLabelText('Заключение'), 'ОРВИ, состояние удовлетворительное');
    await userEvent.type(screen.getByLabelText(/Код МКБ-10/), 'J06.9');
    await userEvent.type(screen.getByLabelText(/Название диагноза 1/), 'Острый назофарингит');
    await userEvent.type(screen.getByLabelText('Рекомендации'), 'Покой, обильное питьё');

    await userEvent.click(screen.getByRole('button', { name: 'Завершить приём' }));

    expect(await screen.findByTestId('encounter-record')).toBeInTheDocument();
  });

  it('should move focus to the completed banner after a successful completion', async () => {
    let isFinished = false;
    setup([
      { path: '/api/v1/encounters/enc-1/complete', method: 'POST', respond: () => { isFinished = true; return { id: 'enc-1', status: 'finished' }; } },
      encounterRoute(() => encounter(isFinished ? FINISHED_CONTENT : {})),
    ]);
    await userEvent.type(await screen.findByLabelText('Заключение'), 'ОРВИ, состояние удовлетворительное');
    await userEvent.type(screen.getByLabelText(/Код МКБ-10/), 'J06.9');
    await userEvent.type(screen.getByLabelText(/Название диагноза 1/), 'Острый назофарингит');
    await userEvent.type(screen.getByLabelText('Рекомендации'), 'Покой, обильное питьё');

    await userEvent.click(screen.getByRole('button', { name: 'Завершить приём' }));

    await waitFor(() => expect(screen.getByTestId('encounter-readonly')).toHaveFocus());
  });

  it('should move focus to the banner when a replay turns the form into the record', async () => {
    let isFinished = false;
    setup([
      { path: '/api/v1/encounters/enc-1/complete', method: 'POST', respond: () => { isFinished = true; throw problem(409, 'ENCOUNTER_STATE_INVALID'); } },
      encounterRoute(() => encounter(isFinished ? FINISHED_CONTENT : {})),
    ]);
    await userEvent.type(await screen.findByLabelText('Заключение'), 'ОРВИ, состояние удовлетворительное');
    await userEvent.type(screen.getByLabelText(/Код МКБ-10/), 'J06.9');
    await userEvent.type(screen.getByLabelText(/Название диагноза 1/), 'Острый назофарингит');
    await userEvent.type(screen.getByLabelText('Рекомендации'), 'Покой, обильное питьё');

    await userEvent.click(screen.getByRole('button', { name: 'Завершить приём' }));

    await waitFor(() => expect(screen.getByTestId('encounter-readonly')).toHaveFocus());
  });

  it('should not steal focus when a finished encounter is simply opened', async () => {
    setup([encounterRoute(() => encounter(FINISHED_CONTENT))]);

    await screen.findByTestId('encounter-record');

    expect(screen.getByTestId('encounter-readonly')).not.toHaveFocus();
  });
});
