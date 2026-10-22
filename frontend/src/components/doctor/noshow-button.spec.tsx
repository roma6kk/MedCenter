import Link from 'next/link';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { newQueryClient, problem, renderWithClient, type ApiMock } from './doctor-test-utils';
import { NoshowButton } from './noshow-button';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as ApiMock;

function renderButton(patientName?: string): void {
  renderWithClient(<NoshowButton appointmentId="a1" patientName={patientName} />, newQueryClient());
}

/** The button where the journal puts it: a row that has the patient link, which the actions of a finished visit leave behind. */
function renderInRow(): void {
  renderWithClient(
    <table>
      <tbody>
        <tr>
          <td><Link href="/patients/p1" data-row-anchor>Кузнецов А.</Link></td>
          <td><NoshowButton appointmentId="a1" /></td>
        </tr>
      </tbody>
    </table>,
    newQueryClient(),
  );
}

describe('NoshowButton', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined as never);
  });

  it('should not call the API until the no-show is confirmed', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Подтверждение неявки' })).toBeInTheDocument();
  });

  it('should POST the no-show for the appointment after confirmation', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить неявку' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/doctor/appointments/a1/noshow', { method: 'POST' }));
  });

  it('should return to the initial state when cancelled', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.getByRole('button', { name: 'Неявка' })).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should name the patient for assistive technology when the name is known', () => {
    renderButton('Кузнецов А.');

    expect(screen.getByRole('button', { name: 'Отметить неявку: Кузнецов А.' })).toBeInTheDocument();
  });

  it('should leave the confirmation when the no-show was recorded', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить неявку' }));

    await waitFor(() => expect(screen.queryByRole('group', { name: 'Подтверждение неявки' })).toBeNull());
  });

  it('should explain that the appointment is no longer booked when the service answers 409 CONFLICT', async () => {
    apiFetchMock.mockRejectedValue(problem(409, 'CONFLICT'));
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить неявку' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Запись уже не в статусе');
  });

  it('should explain why and refresh the journal when the service answers 409 ENCOUNTER_STATE_INVALID for a visit with an encounter', async () => {
    apiFetchMock.mockRejectedValue(problem(409, 'ENCOUNTER_STATE_INVALID'));
    const client = newQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    renderWithClient(<NoshowButton appointmentId="a1" />, client);
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить неявку' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('по ней уже открыт или завершён приём');
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it('should keep the confirmation open and show the message when the request fails with a server error', async () => {
    apiFetchMock.mockRejectedValue(problem(500, 'INTERNAL'));
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить неявку' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Внутренняя ошибка');
    expect(screen.getByRole('group', { name: 'Подтверждение неявки' })).toBeInTheDocument();
  });

  it('should move focus to the confirm button when the confirmation opens', async () => {
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));

    expect(screen.getByRole('button', { name: 'Подтвердить неявку' })).toHaveFocus();
  });

  it('should return focus to the no-show button when the confirmation is cancelled', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.getByRole('button', { name: 'Неявка' })).toHaveFocus();
  });

  it('should close the confirmation and return focus when Escape is pressed', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('group', { name: 'Подтверждение неявки' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Неявка' })).toHaveFocus();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should move focus to the patient link of the row when the no-show was recorded', async () => {
    renderInRow();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить неявку' }));

    await waitFor(() => expect(screen.getByRole('link', { name: 'Кузнецов А.' })).toHaveFocus());
  });

  it('should keep focus where it is when the no-show failed', async () => {
    apiFetchMock.mockRejectedValue(problem(500, 'INTERNAL'));
    renderInRow();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить неявку' }));
    await screen.findByRole('alert');

    expect(screen.getByRole('link', { name: 'Кузнецов А.' })).not.toHaveFocus();
  });
});
