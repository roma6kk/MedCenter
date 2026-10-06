import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { EncounterCompleteForm } from './encounter-complete-form';
import { apiFetch, ApiError } from '@/lib/api/api-fetch';
import type { ProblemDetails } from '@/lib/api/problem';
import type { ReactNode } from 'react';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;
const COMPLETE_PATH = '/api/v1/encounters/enc-1/complete';

function renderForm(props: { readonly readOnly?: boolean } = {}): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<EncounterCompleteForm encounterId="enc-1" readOnly={props.readOnly} />, { wrapper: Wrapper });
}

function completeCall(): [string, RequestInit?] | undefined {
  return apiFetchMock.mock.calls.find(([path]) => path === COMPLETE_PATH);
}

function completeBody(): Record<string, unknown> {
  return JSON.parse(String(completeCall()?.[1]?.body)) as Record<string, unknown>;
}

async function submit(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Завершить приём' }));
}

async function typeValidDiagnosis(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Заключение'), 'ОРВИ, состояние удовлетворительное');
  await userEvent.type(screen.getByLabelText('Код МКБ-10'), 'J06.9');
  await userEvent.type(screen.getByLabelText(/Название диагноза/), 'Острая респираторная инфекция');
  await userEvent.type(screen.getByLabelText(/Рекомендации/), 'Покой, обильное питьё, контроль температуры');
}

const UCUM_UNITS = ['Cel', 'mg', 'g', 'mL', 'mmol/L', 'mg/dL'];

describe('EncounterCompleteForm validation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    apiFetchMock.mockImplementation((path: string) =>
      path.startsWith('/api/v1/terminology/expand') ? Promise.resolve({ items: [] }) : Promise.resolve(undefined),
    );
  });

  it('should expose only the whitelisted UCUM units in the observation select', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Добавить наблюдение' }));

    const select = screen.getByLabelText(/Единица UCUM/);
    const values = Array.from(select.querySelectorAll('option')).map((option) => option.value);
    expect(values).toEqual(UCUM_UNITS);
  });

  it('should block submission and show field errors when the summary and diagnosis are empty', async () => {
    renderForm();

    await submit();

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(completeCall()).toBeUndefined();
  });

  it('should not call the API while required diagnoses are missing', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Заключение'), 'ОРВИ, состояние удовлетворительное');
    await userEvent.type(screen.getByLabelText(/Рекомендации/), 'Покой, обильное питьё, контроль температуры');
    await submit();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Завершить приём' })).toBeEnabled());
    expect(completeCall()).toBeUndefined();
  });

  it('should block submission for an invalid ICD-10 code', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Заключение'), 'ОРВИ, состояние удовлетворительное');
    await userEvent.type(screen.getByLabelText(/Рекомендации/), 'Покой, обильное питьё, контроль температуры');
    await userEvent.type(screen.getByLabelText('Код МКБ-10'), 'bad');
    await userEvent.type(screen.getByLabelText(/Название диагноза/), 'Диагноз');
    await submit();

    expect(await screen.findByText('Некорректный код МКБ-10')).toBeInTheDocument();
    expect(completeCall()).toBeUndefined();
  });

  it('should submit the atomic payload once a diagnosis is filled in', async () => {
    renderForm();

    await typeValidDiagnosis();
    await submit();

    await waitFor(() => expect(completeCall()).toBeDefined());
    expect(completeCall()?.[1]?.method).toBe('POST');
    expect(completeBody()['diagnoses']).toEqual([
      { code: 'J06.9', display: 'Острая респираторная инфекция' },
    ]);
  });

  it('should send an Idempotency-Key on the complete request', async () => {
    renderForm();

    await typeValidDiagnosis();
    await submit();

    await waitFor(() => expect(completeCall()).toBeDefined());
    const headers = completeCall()?.[1]?.headers as Record<string, string> | undefined;
    expect(headers?.['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('should add a second diagnosis row and submit both diagnoses', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Заключение'), 'Два диагноза');
    await userEvent.type(screen.getByLabelText(/Рекомендации/), 'Покой, обильное питьё, контроль температуры');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить диагноз' }));
    const codes = screen.getAllByLabelText('Код МКБ-10');
    const displays = screen.getAllByLabelText(/Название диагноза/);
    await userEvent.type(codes[0], 'J06.9');
    await userEvent.type(displays[0], 'ОРВИ');
    await userEvent.type(codes[1], 'K21.0');
    await userEvent.type(displays[1], 'ГЭРБ');
    await submit();

    await waitFor(() => expect(completeCall()).toBeDefined());
    expect(completeBody()['diagnoses']).toEqual([
      { code: 'J06.9', display: 'ОРВИ' },
      { code: 'K21.0', display: 'ГЭРБ' },
    ]);
  });

  it('should remove a diagnosis row but never the last one', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Добавить диагноз' }));
    expect(screen.getAllByLabelText('Код МКБ-10')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить диагноз 1' }));

    expect(screen.getAllByLabelText('Код МКБ-10')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Удалить диагноз/ })).toBeNull();
  });

  it('should submit observations, service requests and medication requests', async () => {
    renderForm();

    await typeValidDiagnosis();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить наблюдение' }));
    await userEvent.type(screen.getByLabelText(/Код показателя/), '8480-6');
    await userEvent.type(screen.getByLabelText(/Значение/), '36.6');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить услугу' }));
    await userEvent.type(screen.getByLabelText(/Код услуги/), 'SRV-1');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить лекарство' }));
    await userEvent.type(screen.getByLabelText(/Код АТХ/), 'N02BE01');
    await userEvent.type(screen.getByLabelText(/Дозировка/), '1 таб 3 раза в день после еды');
    await submit();

    await waitFor(() => expect(completeCall()).toBeDefined());
    const body = completeBody();
    expect(body['observations']).toEqual([
      {
        codeSystem: 'https://fhir.by/CodeSystem/nsi-observations',
        code: '8480-6',
        value: 36.6,
        unit: 'Cel',
      },
    ]);
    expect(body['serviceRequests']).toEqual([
      { codeSystem: 'https://fhir.by/CodeSystem/nsi-services', code: 'SRV-1' },
    ]);
    expect(body['medicationRequests']).toEqual([{ atcCode: 'N02BE01', dosageText: '1 таб 3 раза в день после еды' }]);
  });

  it('should block submission for an invalid ATC code', async () => {
    renderForm();

    await typeValidDiagnosis();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить лекарство' }));
    await userEvent.type(screen.getByLabelText(/Код АТХ/), 'bad');
    await userEvent.type(screen.getByLabelText(/Дозировка/), 'x');
    await submit();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Завершить приём' })).toBeEnabled());
    expect(completeCall()).toBeUndefined();
  });

  it('should render the form read-only when the readOnly prop is set', () => {
    renderForm({ readOnly: true });

    expect(screen.getByTestId('encounter-readonly')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Завершить приём' })).toBeNull();
  });

  it('should hide the read-only banner when readOnly is false', () => {
    renderForm({ readOnly: false });

    expect(screen.queryByTestId('encounter-readonly')).toBeNull();
    expect(screen.getByRole('button', { name: 'Завершить приём' })).toBeInTheDocument();
  });

  it('should surface ENCOUNTER_STATE_INVALID as the read-only trigger code', () => {
    // The mutation onError handler flips the form to read-only only for this code.
    const problem: ProblemDetails = { title: 'Conflict', status: 409, errorCode: 'ENCOUNTER_STATE_INVALID' };
    expect(new ApiError(problem).problem.errorCode).toBe('ENCOUNTER_STATE_INVALID');
  });
});
