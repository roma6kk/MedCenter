import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { apiProblem, pageOf, renderWithClient } from '../shared/test-utils';
import { TerminologyPanel } from './terminology-panel';
import type { ImportAccepted, ValueSetSummary } from './terminology-types';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

const valueSets: ReadonlyArray<ValueSetSummary> = [
  { url: 'https://fhir.by/ValueSet/atc', name: 'Atc', title: 'АТХ (ATC)', version: '2024', status: 'active' },
  { url: 'https://fhir.by/ValueSet/nsi-services', name: 'NsiServices', title: 'НСИ ЦИСЗ — услуги', version: '1.4.463', status: 'draft' },
];

const accepted: ImportAccepted = { importId: 'b7d1c1f0-0000-4000-8000-000000000001', snapshotVersion: '1.4.463', status: 'ACCEPTED', acceptedAt: '2026-10-16T16:00:00.000Z' };

function importCall(): readonly [string, RequestInit?] | undefined {
  return apiFetchMock.mock.calls.find(([path]) => path === '/api/v1/admin/terminology/import');
}

async function startImport(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Запустить импорт' }));
}

describe('TerminologyPanel', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path) => (path === '/api/v1/terminology/value-sets' ? Promise.resolve(pageOf(valueSets)) : Promise.resolve(accepted)));
  });

  it('should list the seeded value sets with their canonical URL, release and status when the panel loads', async () => {
    renderWithClient(<TerminologyPanel />);

    const table = within(await screen.findByRole('table', { name: 'Наборы значений (ValueSet)' }));

    expect(await table.findByText('АТХ (ATC)')).toBeInTheDocument();
    expect(table.getByText('https://fhir.by/ValueSet/nsi-services')).toBeInTheDocument();
    expect(table.getByText('1.4.463')).toBeInTheDocument();
    expect(table.getByTestId('stamp-active')).toBeInTheDocument();
    expect(table.getByText('Черновик')).toBeInTheDocument();
  });

  it('should show the empty state when no value set is seeded', async () => {
    apiFetchMock.mockResolvedValue(pageOf([]));
    renderWithClient(<TerminologyPanel />);

    expect(await screen.findByTestId('empty-state')).toHaveTextContent('Наборов значений нет');
  });

  it('should start with the bundled release in the version field when the panel opens', () => {
    renderWithClient(<TerminologyPanel />);

    expect(screen.getByLabelText(/Версия снапшота/)).toHaveValue('1.4.463');
  });

  it('should post {snapshotVersion} and report the accepted import when the server answers 202', async () => {
    renderWithClient(<TerminologyPanel />);

    await startImport();

    const outcome = await screen.findByTestId('import-accepted');
    expect(outcome).toHaveTextContent('Импорт принят и выполняется в фоне');
    expect(outcome).toHaveTextContent(accepted.importId);
    const [, options] = importCall() ?? [];
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({ snapshotVersion: '1.4.463' });
  });

  it('should send no Idempotency-Key when the import starts, because the server does not use one', async () => {
    renderWithClient(<TerminologyPanel />);

    await startImport();

    await screen.findByTestId('import-accepted');
    const [, options] = importCall() ?? [];
    expect(new Headers(options?.headers).has('Idempotency-Key')).toBe(false);
  });

  it('should refresh the value sets when an import is accepted', async () => {
    renderWithClient(<TerminologyPanel />);
    await screen.findAllByText('АТХ (ATC)');

    await startImport();
    await screen.findByTestId('import-accepted');

    await waitFor(() => expect(apiFetchMock.mock.calls.filter(([path]) => path === '/api/v1/terminology/value-sets').length).toBeGreaterThanOrEqual(2));
  });

  it('should say the import is already running when the server answers 409 IMPORT_RUNNING', async () => {
    apiFetchMock.mockImplementation((path) =>
      path === '/api/v1/terminology/value-sets' ? Promise.resolve(pageOf(valueSets)) : Promise.reject(apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'IMPORT_RUNNING: a terminology import is already running' })),
    );
    renderWithClient(<TerminologyPanel />);

    await startImport();

    expect(await screen.findByTestId('import-running')).toHaveTextContent('Импорт уже выполняется');
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should show the problem banner and not say the import is running when the server answers another 409', async () => {
    apiFetchMock.mockImplementation((path) =>
      path === '/api/v1/terminology/value-sets' ? Promise.resolve(pageOf(valueSets)) : Promise.reject(apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'the terminology store is locked by a migration' })),
    );
    renderWithClient(<TerminologyPanel />);

    await startImport();

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('Конфликт с существующими данными');
    expect(screen.queryByTestId('import-running')).not.toBeInTheDocument();
  });

  it('should put a malformed version at the field and send nothing when the import starts', async () => {
    renderWithClient(<TerminologyPanel />);
    await userEvent.clear(screen.getByLabelText(/Версия снапшота/));
    await userEvent.type(screen.getByLabelText(/Версия снапшота/), 'v1.4');

    await startImport();

    expect(await screen.findByText('Введите номер релиза: числа через точку, например 1.4.463')).toBeInTheDocument();
    expect(importCall()).toBeUndefined();
  });

  it('should put the server message at the version field and focus it when the server answers 400 with details', async () => {
    apiFetchMock.mockImplementation((path) =>
      path === '/api/v1/terminology/value-sets'
        ? Promise.resolve(pageOf(valueSets))
        : Promise.reject(apiProblem({ status: 400, errorCode: 'VALIDATION_ERROR', details: [{ field: 'snapshotVersion', message: 'snapshotVersion must be a release number such as 1.4.463' }] })),
    );
    renderWithClient(<TerminologyPanel />);

    await startImport();

    expect(await screen.findByText('snapshotVersion must be a release number such as 1.4.463')).toBeInTheDocument();
    expect(screen.getByLabelText(/Версия снапшота/)).toHaveFocus();
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should say the version is not bundled at the field when the server answers 422 SNAPSHOT_NOT_BUNDLED', async () => {
    apiFetchMock.mockImplementation((path) =>
      path === '/api/v1/terminology/value-sets'
        ? Promise.resolve(pageOf(valueSets))
        : Promise.reject(apiProblem({ status: 422, errorCode: 'TERMINOLOGY_NOT_FOUND', detail: 'SNAPSHOT_NOT_BUNDLED: snapshot 9.9.9 is not bundled; available: 1.4.463' })),
    );
    renderWithClient(<TerminologyPanel />);
    await userEvent.clear(screen.getByLabelText(/Версия снапшота/));
    await userEvent.type(screen.getByLabelText(/Версия снапшота/), '9.9.9');

    await startImport();

    expect(await screen.findByText('Эта версия снапшота не входит в поставку сервиса')).toBeInTheDocument();
    expect(screen.getByLabelText(/Версия снапшота/)).toHaveFocus();
  });

  it('should drop the old refusal when the version is edited after a 422', async () => {
    apiFetchMock.mockImplementation((path) =>
      path === '/api/v1/terminology/value-sets'
        ? Promise.resolve(pageOf(valueSets))
        : Promise.reject(apiProblem({ status: 422, errorCode: 'TERMINOLOGY_NOT_FOUND', detail: 'SNAPSHOT_NOT_BUNDLED: snapshot 9.9.9 is not bundled; available: 1.4.463' })),
    );
    renderWithClient(<TerminologyPanel />);
    await userEvent.clear(screen.getByLabelText(/Версия снапшота/));
    await userEvent.type(screen.getByLabelText(/Версия снапшота/), '9.9.9');
    await startImport();
    await screen.findByText('Эта версия снапшота не входит в поставку сервиса');

    await userEvent.type(screen.getByLabelText(/Версия снапшота/), '1');

    expect(screen.queryByText('Эта версия снапшота не входит в поставку сервиса')).not.toBeInTheDocument();
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should show a problem banner when the import cannot start for another reason', async () => {
    apiFetchMock.mockImplementation((path) =>
      path === '/api/v1/terminology/value-sets' ? Promise.resolve(pageOf(valueSets)) : Promise.reject(apiProblem({ status: 500, errorCode: 'INTERNAL' })),
    );
    renderWithClient(<TerminologyPanel />);

    await startImport();

    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
  });

  it('should ignore clicks on the start button when the request is running, so a double click starts one import', async () => {
    let release: (value: ImportAccepted) => void = () => undefined;
    apiFetchMock.mockImplementation((path) =>
      path === '/api/v1/terminology/value-sets' ? Promise.resolve(pageOf(valueSets)) : new Promise((resolve) => { release = resolve as (value: ImportAccepted) => void; }),
    );
    renderWithClient(<TerminologyPanel />);

    await startImport();

    const running = screen.getByRole('button', { name: 'Отправляем…' });
    expect(running).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(running);
    release(accepted);
    await screen.findByTestId('import-accepted');
    expect(apiFetchMock.mock.calls.filter(([path]) => path === '/api/v1/admin/terminology/import')).toHaveLength(1);
  });

  it('should keep the focus on the start button when the request is running', async () => {
    apiFetchMock.mockImplementation((path) => (path === '/api/v1/terminology/value-sets' ? Promise.resolve(pageOf(valueSets)) : new Promise(() => undefined)));
    renderWithClient(<TerminologyPanel />);

    await startImport();

    expect(await screen.findByRole('button', { name: 'Отправляем…' })).toHaveFocus();
  });

  it('should hold the start button closed and count the seconds when the server answers 429 with Retry-After', async () => {
    apiFetchMock.mockImplementation((path) =>
      path === '/api/v1/terminology/value-sets' ? Promise.resolve(pageOf(valueSets)) : Promise.reject(apiProblem({ status: 429, errorCode: 'RATE_LIMITED', retryAfter: 8 })),
    );
    renderWithClient(<TerminologyPanel />);

    await startImport();
    await userEvent.click(await screen.findByRole('button', { name: 'Повторите через 8 с.' }));

    expect(apiFetchMock.mock.calls.filter(([path]) => path === '/api/v1/admin/terminology/import')).toHaveLength(1);
  });

  it('should list every value set as a card for a phone when the table is also rendered', async () => {
    renderWithClient(<TerminologyPanel />);
    await screen.findByRole('table', { name: 'Наборы значений (ValueSet)' });

    const cards = screen.getAllByRole('listitem');

    expect(cards).toHaveLength(valueSets.length);
    expect(within(cards[1] as HTMLElement).getByText('НСИ ЦИСЗ — услуги')).toBeInTheDocument();
    expect(within(cards[1] as HTMLElement).getByText('https://fhir.by/ValueSet/nsi-services')).toBeInTheDocument();
    expect(within(cards[1] as HTMLElement).getByText('Черновик')).toBeInTheDocument();
  });

  it('should keep the page sections in one shrinkable column when a wide table could widen the page on a phone', async () => {
    renderWithClient(<TerminologyPanel />);
    const section = (await screen.findByRole('heading', { name: 'Наборы значений (ValueSet)' })).closest('section');

    expect(section?.parentElement).toHaveClass('grid-cols-1');
  });
});
