import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});
jest.mock('@/lib/ics', () => ({ ...jest.requireActual('@/lib/ics'), downloadIcs: jest.fn() }));

import { downloadIcs } from '@/lib/ics';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { apiFetchMock, postBodies, reachConfirmation, renderWizard, serveApi } from './booking-test-utils';

const downloadMock = downloadIcs as jest.MockedFunction<typeof downloadIcs>;

describe('BookingWizard doctor step (B8)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useBookingDraftStore.getState().clearDraft();
    serveApi();
  });

  it('should show the nearest time of each doctor as chips when the doctor step opens', async () => {
    renderWizard();
    await userEvent.click(await screen.findByTestId('service-svc-30'));

    const chip = await screen.findByTestId('nearest-slot-30');

    expect(chip).toHaveAccessibleName(expect.stringMatching(/^Записаться: .*11:00, Мария Иванова$/));
    expect(screen.getByText(/Ближайшее: .*11:00/)).toBeInTheDocument();
    expect(screen.queryByTestId('nearest-slot-20')).not.toBeInTheDocument();
  });

  it('should say a doctor has no time in the next two weeks when the search finds none', async () => {
    renderWizard();
    await userEvent.click(await screen.findByTestId('service-svc-30'));

    expect(await screen.findByText('В ближайшие две недели свободного времени нет')).toBeInTheDocument();
  });

  it('should choose the doctor and the time and go straight to the confirmation when a nearest-time chip is clicked', async () => {
    renderWizard();
    await userEvent.click(await screen.findByTestId('service-svc-30'));

    await userEvent.click(await screen.findByTestId('nearest-slot-30'));

    expect(await screen.findByRole('button', { name: 'Подтвердить запись' })).toBeInTheDocument();
    // The doctor is named at once from the list the step already holds (no "…" while his own entry loads).
    expect(screen.getByTestId('booking-draft-summary')).toHaveTextContent('Мария Иванова');
    const draft = useBookingDraftStore.getState();
    expect([draft.doctorId, draft.slotId, draft.step]).toEqual(['doc-1', 'slot-30', 4]);
  });

  it('should skip the doctor step and open the slot step when the service has a single doctor', async () => {
    renderWizard();

    await userEvent.click(await screen.findByTestId('service-svc-20'));

    expect(await screen.findByRole('heading', { name: 'Выберите время' })).toBeInTheDocument();
    expect(useBookingDraftStore.getState().doctorId).toBe('doc-1');
  });

  it('should leave the single doctor changeable when the visitor goes back to the doctor step', async () => {
    renderWizard();
    await userEvent.click(await screen.findByTestId('service-svc-20'));
    await screen.findByRole('heading', { name: 'Выберите время' });

    await userEvent.click(screen.getByRole('button', { name: /2.*Врач/ }));

    expect(await screen.findByTestId('doctor-doc-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: /Врачи для услуги/ })).toBeInTheDocument();
  });
});

describe('BookingWizard confirmation (B9)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useBookingDraftStore.getState().clearDraft();
    serveApi();
  });

  it('should keep the panel "Ваша запись" with the confirm button, the address and the cancellation hint on the confirmation step', async () => {
    renderWizard();
    await reachConfirmation();

    const panel = screen.getByTestId('booking-draft-summary');
    expect(within(panel).getByRole('button', { name: 'Подтвердить запись' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('г. Минск, ул. Здоровья, 12');
    expect(panel).toHaveTextContent('Отменить запись можно в разделе «Мои записи».');
  });

  it.each([
    ['summary-edit-1', 'Выберите услугу'],
    ['summary-edit-2', /Врачи для услуги/],
    ['summary-edit-3', 'Выберите время'],
  ])('should go back to the step that made the choice when %s is pressed', async (testId, heading) => {
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByTestId(testId));

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('should not offer «Изменить» on the steps before the confirmation', async () => {
    renderWizard();
    await userEvent.click(await screen.findByTestId('service-svc-30'));
    await screen.findByTestId('doctor-doc-1');

    expect(screen.queryByTestId('summary-edit-1')).not.toBeInTheDocument();
  });
});

describe('BookingWizard success screen (B1)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useBookingDraftStore.getState().clearDraft();
    serveApi(() => Promise.resolve({ id: 'appt-9', status: 'booked', start: '2026-10-30T06:00:00.000Z', end: '2026-10-30T06:30:00.000Z' }));
  });

  it('should show when, with whom, what and where after the booking is confirmed', async () => {
    renderWizard();
    await reachConfirmation();
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    const details = await screen.findByTestId('success-details');

    expect(details).toHaveTextContent('09:00–09:30');
    expect(details).toHaveTextContent('Мария Иванова');
    expect(details).toHaveTextContent('Приём терапевта (первичный)');
    expect(details).toHaveTextContent('г. Минск, ул. Здоровья, 12');
    expect(postBodies()).toHaveLength(1);
  });

  it('should hand a calendar file of the visit to the browser when «Добавить в календарь» is pressed', async () => {
    renderWizard();
    await reachConfirmation();
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Добавить в календарь' }));

    expect(downloadMock).toHaveBeenCalledTimes(1);
    const [fileName, content] = downloadMock.mock.calls[0] as [string, string];
    expect(fileName).toBe('lifeline-visit-2026-10-30.ics');
    expect(content).toContain('DTSTART:20261030T060000Z');
    expect(content).toContain('DTEND:20261030T063000Z');
    expect(content).toContain('UID:appt-9@lifeline');
    expect(content.replace(/\r\n /g, '')).toContain('LOCATION:г. Минск\\, ул. Здоровья\\, 12');
    expect(content).not.toMatch(/ATTENDEE|ORGANIZER/);
  });

  it('should move focus to the heading of the success screen and offer cancellation only as a text link', async () => {
    renderWizard();
    await reachConfirmation();
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    const heading = await screen.findByRole('heading', { name: 'Вы записаны на приём' });

    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByTestId('success-cancel-link')).toHaveAttribute('href', '/appointments/appt-9');
    expect(screen.queryByRole('button', { name: /Отменить/ })).not.toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/appointments/appt-9');
  });
});
