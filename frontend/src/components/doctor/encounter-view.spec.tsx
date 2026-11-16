jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

jest.setTimeout(30_000);

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { createAppQueryClient } from '@/lib/api/query-client';
import { encounter, FINISHED_CONTENT, pageOf, problem, renderWithClient, routeApi, type ApiMock, type ApiRoute } from './doctor-test-utils';
import { ACTIVE_RECORD } from '@/components/consent/consent-fixtures';
import { readDraft, writeDraft } from '@/lib/encounter-draft';
import { EMPTY_DIAGNOSIS } from './encounter-form-defaults';
import { useSessionStore } from '@/store/use-session-store';
import { EncounterView } from './encounter-view';
import type { EncounterDetails } from './doctor-types';

const apiFetchMock = apiFetch as ApiMock;
const PATIENT: ApiRoute = { path: '/api/v1/patients/p1', respond: () => ({ id: 'p1', active: true, fullName: 'Кузнецов Алексей Иванович', lastName: 'Кузнецов', firstName: 'Алексей', birthDate: '1978-07-21', gender: 'male', telecom: [] }) };
const CONTEXT: ReadonlyArray<ApiRoute> = [
  { path: '/api/v1/patients/p1/consent', respond: () => ({ active: ACTIVE_RECORD, history: [ACTIVE_RECORD] }) },
  { path: '/api/v1/patients/p1/history', respond: () => pageOf([]) },
  { path: '/api/v1/patients/p1/prescriptions', respond: () => pageOf([]) },
  { path: '/api/v1/doctor/appointments', respond: () => pageOf([]) },
];
const EXPANSION: ApiRoute = {
  path: '/api/v1/terminology/expand',
  respond: (path) => ({ valueSet: 'x', total: 1, items: path.includes('InternClassificDiseases10') ? [{ system: 'https://fhir.by/CodeSystem/InternClassificDiseases10', code: 'J06.9', display: 'Острый назофарингит' }] : [] }),
};

async function fillTheForm(): Promise<void> {
  await userEvent.type(await screen.findByLabelText('Заключение'), 'ОРВИ, состояние удовлетворительное');
  await userEvent.type(screen.getByLabelText(/Диагноз 1:/), 'J06');
  await userEvent.click(await screen.findByRole('option', { name: /J06\.9/ }));
  await userEvent.type(screen.getByLabelText('Рекомендации'), 'Покой, обильное питьё');
}

function encounterRoute(respond: () => EncounterDetails): ApiRoute {
  return { path: '/api/v1/encounters/enc-1', respond };
}

function setup(routes: ReadonlyArray<ApiRoute>, seed?: () => void): void {
  apiFetchMock.mockReset();
  window.localStorage.clear();
  seed?.();
  routeApi(apiFetchMock, [...routes, PATIENT, ...CONTEXT, EXPANSION]);
  renderWithClient(<EncounterView encounterId="enc-1" />, createAppQueryClient());
}

const COMPLETED = (): unknown => ({ id: 'enc-1', status: 'finished' });
const REPLAYED = (): never => { throw problem(409, 'ENCOUNTER_STATE_INVALID'); };

function setupCompletion(answer: () => unknown): void {
  let isFinished = false;
  setup([
    { path: '/api/v1/encounters/enc-1/complete', method: 'POST', respond: () => { isFinished = true; return answer(); } },
    encounterRoute(() => encounter(isFinished ? FINISHED_CONTENT : {})),
  ]);
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
    expect(within(record).getByText('36,6 °C')).toHaveAttribute('title', 'Cel');
    expect(within(record).getByText('J01FA10')).toBeInTheDocument();
    expect(within(record).getByText('Азитромицин')).toBeInTheDocument();
    expect(within(record).getByText('1 таб 3 раза в день')).toBeInTheDocument();
    expect(within(record).getByText('Покой, обильное питьё')).toBeInTheDocument();
  });

  it('should drop the local draft of a visit that turns out to be finished already', async () => {
    const seedDraft = (): void => {
      writeDraft('enc-1', { summary: 'Текст черновика чужого приёма', diagnoses: [EMPTY_DIAGNOSIS], recommendations: '', observations: [], serviceRequests: [], medicationRequests: [] });
    };
    setup([encounterRoute(() => encounter(FINISHED_CONTENT))], seedDraft);
    expect(readDraft('enc-1')).not.toBeNull();

    await screen.findByTestId('encounter-record');

    await waitFor(() => expect(readDraft('enc-1')).toBeNull());
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

  it('should open an in-progress visit of a colleague read-only, without the completion form', async () => {
    useSessionStore.setState({ fhirUser: 'PractitionerRole/role-2' });
    setup([encounterRoute(() => encounter())]);

    expect(await screen.findByText(/ведёт другой врач/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Оформление приёма' })).toBeNull();
    useSessionStore.setState({ fhirUser: null });
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

describe('EncounterView patient context (A3)', () => {
  const HISTORY_ITEM = { id: 'enc-9', date: '2026-10-14T06:00:00Z', status: 'finished', diagnosis: 'J06.9', diagnoses: [{ code: 'J06.9', display: 'Острый назофарингит' }], appointmentId: 'appt-9', practitionerRoleId: 'role-1' };
  const WITH_HISTORY: ReadonlyArray<ApiRoute> = [
    { path: '/api/v1/patients/p1/history', respond: () => pageOf([HISTORY_ITEM]) },
    { path: '/api/v1/encounters/enc-9', respond: () => encounter({ ...FINISHED_CONTENT, id: 'enc-9' }) },
    { path: '/api/v1/patients/p1/prescriptions', respond: () => pageOf([{ id: 'm1', kind: 'medication', status: 'active', atcCode: 'J01FA10', atcDisplay: 'Азитромицин', dosageText: '1 таб 3 раза в день', encounterId: 'enc-9' }]) },
  ];

  it('should keep the patient in a bar above the form: name, age, sex and the consent badge', async () => {
    setup([encounterRoute(() => encounter())]);

    const bar = within(await screen.findByRole('region', { name: 'Пациент приёма' }));

    expect(await bar.findByRole('link', { name: 'Кузнецов Алексей Иванович' })).toHaveAttribute('href', '/patients/p1');
    expect(bar.getByText(/48 лет · Мужской/)).toBeInTheDocument();
    expect(await bar.findByTestId('consent-line-active')).toHaveTextContent('Согласие на ведение записей в ИС клиники · действует с 20.10.2026');
  });

  it('should warn in the bar when the patient has no consent', async () => {
    setup([encounterRoute(() => encounter()), { path: '/api/v1/patients/p1/consent', respond: () => ({ active: null, history: [] }) }]);

    expect(await screen.findByTestId('consent-line-none')).toHaveTextContent('Нет согласия на ведение записей в ИС клиники');
  });

  it('should show the same summary as the patient card beside the form: diagnoses, prescriptions and vitals', async () => {
    setup([encounterRoute(() => encounter()), ...WITH_HISTORY]);

    const summary = within(await screen.findByRole('complementary', { name: 'Сведения о пациенте' }));

    expect(await summary.findByText('Острый назофарингит')).toBeInTheDocument();
    expect(await summary.findByText('Азитромицин')).toBeInTheDocument();
    expect(await summary.findByText('Температура тела')).toBeInTheDocument();
    expect(summary.getByText('36,6 °C')).toBeInTheDocument();
  });

  it('should say compactly that there is nothing yet for a patient without history', async () => {
    setup([encounterRoute(() => encounter())]);

    const summary = within(await screen.findByRole('complementary', { name: 'Сведения о пациенте' }));

    expect(await summary.findByText('Диагнозов пока нет')).toBeInTheDocument();
    expect(summary.getByText('Действующих назначений нет')).toBeInTheDocument();
    expect(await summary.findByText('Показателей пока нет')).toBeInTheDocument();
  });

  it('should open the summary in a drawer from the bar and close it again', async () => {
    setup([encounterRoute(() => encounter()), ...WITH_HISTORY]);

    await userEvent.click(await screen.findByRole('button', { name: 'Сведения о пациенте' }));
    const drawer = within(await screen.findByRole('dialog', { name: 'Сведения о пациенте' }));

    expect(await drawer.findByText('Острый назофарингит')).toBeInTheDocument();
    await userEvent.click(drawer.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('EncounterView in progress (A6, A7, A8)', () => {
  const HISTORY_ITEM = { id: 'enc-9', date: '2026-10-14T06:00:00Z', status: 'finished', diagnosis: 'K21.0', diagnoses: [{ code: 'K21.0', display: 'ГЭРБ с эзофагитом' }], appointmentId: 'appt-9', practitionerRoleId: 'role-1' };

  afterEach(() => jest.restoreAllMocks());

  it('should show how long the visit has been going, from its start', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-20T06:23:30Z'));
    setup([encounterRoute(() => encounter())]);

    const bar = within(await screen.findByRole('region', { name: 'Пациент приёма' }));

    expect(await bar.findByTestId('encounter-duration')).toHaveTextContent('Идёт 23 мин');
  });

  it('should read an hour and more as hours and minutes', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-20T07:05:00Z'));
    setup([encounterRoute(() => encounter())]);

    expect(await screen.findByTestId('encounter-duration')).toHaveTextContent('Идёт 1 ч 05 мин');
  });

  it('should not run a timer on a finished encounter', async () => {
    setup([encounterRoute(() => encounter(FINISHED_CONTENT))]);

    await screen.findByTestId('encounter-record');

    expect(screen.queryByTestId('encounter-duration')).toBeNull();
  });

  it('should offer the patient\'s earlier diagnoses as shortcuts when the diagnosis field is focused empty', async () => {
    setup([encounterRoute(() => encounter()), { path: '/api/v1/patients/p1/history', respond: () => pageOf([HISTORY_ITEM]) }]);

    await userEvent.click(await screen.findByLabelText(/Диагноз 1:/));

    expect(await screen.findByText('Из истории пациента')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /K21\.0 — ГЭРБ с эзофагитом/ })).toBeInTheDocument();
  });

  it('should list the navigator beside the form, in the side column, and as a strip above the form', async () => {
    setup([encounterRoute(() => encounter())]);

    await screen.findByRole('form', { name: 'Оформление приёма' });

    await waitFor(() => expect(screen.getAllByRole('navigation', { name: 'Разделы приёма' })).toHaveLength(2));
    expect(within(screen.getByRole('complementary', { name: 'Сведения о пациенте' }).parentElement as HTMLElement).getByRole('heading', { name: 'Разделы приёма' })).toBeInTheDocument();
  });

  it('should drop the local draft when the visit is completed and the form gives way to the record', async () => {
    setupCompletion(COMPLETED);
    await fillTheForm();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
    expect(readDraft('enc-1')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Завершить приём' }));

    expect(await screen.findByTestId('encounter-record')).toBeInTheDocument();
    expect(readDraft('enc-1')).toBeNull();
  });
});

describe('EncounterView replay of a completed encounter (scenario C2)', () => {
  it('should turn into the read-only record when completing answers 409 ENCOUNTER_STATE_INVALID', async () => {
    setupCompletion(REPLAYED);
    await fillTheForm();

    await userEvent.click(screen.getByRole('button', { name: 'Завершить приём' }));

    expect(await screen.findByTestId('encounter-record')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Оформление приёма' })).toBeNull());
    expect(screen.getByTestId('encounter-readonly')).toBeInTheDocument();
  });

  it('should turn into the read-only record after a successful completion', async () => {
    setupCompletion(COMPLETED);
    await fillTheForm();

    await userEvent.click(screen.getByRole('button', { name: 'Завершить приём' }));

    expect(await screen.findByTestId('encounter-record')).toBeInTheDocument();
  });

  it('should move focus to the completed banner after a successful completion', async () => {
    setupCompletion(COMPLETED);
    await fillTheForm();

    await userEvent.click(screen.getByRole('button', { name: 'Завершить приём' }));

    await waitFor(() => expect(screen.getByTestId('encounter-readonly')).toHaveFocus());
  });

  it('should move focus to the banner when a replay turns the form into the record', async () => {
    setupCompletion(REPLAYED);
    await fillTheForm();

    await userEvent.click(screen.getByRole('button', { name: 'Завершить приём' }));

    await waitFor(() => expect(screen.getByTestId('encounter-readonly')).toHaveFocus());
  });

  it('should not steal focus when a finished encounter is simply opened', async () => {
    setup([encounterRoute(() => encounter(FINISHED_CONTENT))]);

    await screen.findByTestId('encounter-record');

    expect(screen.getByTestId('encounter-readonly')).not.toHaveFocus();
  });
});
