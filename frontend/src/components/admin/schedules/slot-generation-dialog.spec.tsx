import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { apiProblem, renderWithClient } from '../shared/test-utils';
import type { AdminSchedule } from './schedule-types';
import { SlotGenerationDialog } from './slot-generation-dialog';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

jest.mock('../shared/admin-dates', () => ({ ...jest.requireActual('../shared/admin-dates'), todayKey: () => '2026-10-16' }));

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

const schedule: AdminSchedule = { id: '2572', isActive: true, horizonFrom: '2026-10-16', horizonTo: '2026-11-15', windows: [] };

function idempotencyKeys(): ReadonlyArray<string> {
  return apiFetchMock.mock.calls.map(([, options]) => new Headers(options?.headers).get('Idempotency-Key') ?? '');
}

describe('SlotGenerationDialog', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should open on the next two weeks of the horizon and show the horizon when the dialog appears', () => {
    renderWithClient(<SlotGenerationDialog schedule={schedule} onClose={jest.fn()} />);

    expect(screen.getByLabelText(/^С/)).toHaveValue('2026-10-16');
    expect(screen.getByLabelText(/^По/)).toHaveValue('2026-10-30');
    expect(screen.getByText('Горизонт расписания: 16.10.2026 – 15.11.2026')).toBeInTheDocument();
  });

  it('should post {from, to} with an Idempotency-Key to the schedule and report generated and skipped when the form is sent', async () => {
    apiFetchMock.mockResolvedValue({ generated: 4, skipped: 1 });
    renderWithClient(<SlotGenerationDialog schedule={schedule} onClose={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));

    expect(await screen.findByTestId('generation-result')).toHaveTextContent('Создано слотов: 4, пропущено (уже были): 1');
    const [path, options] = apiFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/v1/admin/schedules/2572/generate');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({ from: '2026-10-16', to: '2026-10-30' });
    expect(idempotencyKeys()[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should reuse the Idempotency-Key when the same period is sent again after a failure', async () => {
    apiFetchMock.mockRejectedValueOnce(apiProblem({ status: 503, errorCode: 'INTERNAL' })).mockResolvedValue({ generated: 2, skipped: 0 });
    renderWithClient(<SlotGenerationDialog schedule={schedule} onClose={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));
    await screen.findByTestId('problem-banner');
    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(idempotencyKeys()[1]).toBe(idempotencyKeys()[0]);
  });

  it('should use a new Idempotency-Key when the period was changed', async () => {
    apiFetchMock.mockResolvedValue({ generated: 2, skipped: 0 });
    renderWithClient(<SlotGenerationDialog schedule={schedule} onClose={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));
    await screen.findByTestId('generation-result');

    fireEvent.change(screen.getByLabelText(/^По/), { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(idempotencyKeys()[1]).not.toBe(idempotencyKeys()[0]);
  });

  it('should refuse a period and send nothing when it is outside the horizon', async () => {
    renderWithClient(<SlotGenerationDialog schedule={schedule} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/^По/), { target: { value: '2026-12-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));

    expect(await screen.findByText('Период выходит за горизонт расписания')).toBeInTheDocument();
    expect(screen.getByLabelText(/^С/)).toHaveFocus();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should show the problem when the schedule is no longer active and the server answers 409', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'schedule is inactive' }));
    renderWithClient(<SlotGenerationDialog schedule={schedule} onClose={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Конфликт с существующими данными');
  });

  it('should drop the result of the previous period when the period is edited', async () => {
    apiFetchMock.mockResolvedValue({ generated: 4, skipped: 0 });
    renderWithClient(<SlotGenerationDialog schedule={schedule} onClose={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));
    await screen.findByTestId('generation-result');

    fireEvent.change(screen.getByLabelText(/^По/), { target: { value: '2026-11-01' } });

    expect(screen.queryByTestId('generation-result')).not.toBeInTheDocument();
  });

  it('should drop the banner of the previous failure when the period is edited', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 503, errorCode: 'INTERNAL' }));
    renderWithClient(<SlotGenerationDialog schedule={schedule} onClose={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));
    await screen.findByTestId('problem-banner');

    fireEvent.change(screen.getByLabelText(/^С \*/), { target: { value: '2026-10-20' } });

    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should keep the focus on the button and send once when the generation is running', async () => {
    apiFetchMock.mockReturnValue(new Promise(() => undefined));
    renderWithClient(<SlotGenerationDialog schedule={schedule} onClose={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));
    const running = await screen.findByRole('button', { name: 'Генерируем…' });
    await userEvent.click(running);

    expect(running).toHaveFocus();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('should hold the button closed and count the seconds when the server answers 429 with Retry-After', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 429, errorCode: 'RATE_LIMITED', retryAfter: 9 }));
    renderWithClient(<SlotGenerationDialog schedule={schedule} onClose={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));
    const waiting = await screen.findByRole('button', { name: 'Повторите через 9 с.' });
    await userEvent.click(waiting);

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('should mark both dates invalid and describe them by the period error when the period is refused', async () => {
    renderWithClient(<SlotGenerationDialog schedule={schedule} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/^По/), { target: { value: '2026-12-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));

    await screen.findByText('Период выходит за горизонт расписания');
    expect(screen.getByLabelText(/^По/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^По/)).toHaveAccessibleDescription(/Период выходит за горизонт расписания/);
  });

  it('should mark both dates as required for assistive technology when the dialog opens', () => {
    renderWithClient(<SlotGenerationDialog schedule={schedule} onClose={jest.fn()} />);

    expect(screen.getByLabelText(/^С/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/^По/)).toHaveAttribute('aria-required', 'true');
  });
});
