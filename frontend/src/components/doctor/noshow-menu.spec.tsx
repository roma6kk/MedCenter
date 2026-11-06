import Link from 'next/link';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { newQueryClient, problem, renderWithClient, type ApiMock } from './doctor-test-utils';
import { NoshowMenu } from './noshow-menu';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as ApiMock;

function renderMenu(patientName?: string): void {
  renderWithClient(<NoshowMenu appointmentId="a1" patientName={patientName} />, newQueryClient());
}

function renderInRow(): void {
  renderWithClient(
    <table>
      <tbody>
        <tr>
          <td><Link href="/patients/p1" data-row-anchor>Кузнецов А.</Link></td>
          <td><NoshowMenu appointmentId="a1" /></td>
        </tr>
      </tbody>
    </table>,
    newQueryClient(),
  );
}

async function openDialog(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: 'Действия с записью' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Неявка' }));
  return screen.getByRole('dialog', { name: 'Отметить неявку?' });
}

describe('NoshowMenu', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined as never);
  });

  it('should keep the no-show out of the row until the menu is opened when the journal shows a booked visit', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: 'Действия с записью' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Неявка' })).not.toBeInTheDocument();
  });

  it('should not offer the no-show for a visit whose time has not come', () => {
    renderWithClient(<NoshowMenu appointmentId="a1" start={new Date(Date.now() + 3_600_000).toISOString()} />, newQueryClient());

    expect(screen.queryByRole('button', { name: 'Действия с записью' })).not.toBeInTheDocument();
  });

  it('should offer the no-show once the visit has started', async () => {
    renderWithClient(<NoshowMenu appointmentId="a1" start={new Date(Date.now() - 600_000).toISOString()} />, newQueryClient());

    expect(await screen.findByRole('button', { name: 'Действия с записью' })).toBeInTheDocument();
  });

  it('should not call the API until the no-show is confirmed in the dialog', async () => {
    renderMenu();

    const dialog = await openDialog();

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(dialog).toHaveAccessibleDescription(/Из журнала эту отметку снять нельзя/);
  });

  it('should POST the no-show for the appointment after confirmation', async () => {
    renderMenu();
    const dialog = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить неявку' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/doctor/appointments/a1/noshow', { method: 'POST' }));
  });

  it('should send nothing and close the dialog when it is cancelled', async () => {
    renderMenu();
    const dialog = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should name the patient for assistive technology and in the dialog when the name is known', async () => {
    renderMenu('Кузнецов А.');

    await userEvent.click(screen.getByRole('button', { name: 'Действия с записью: Кузнецов А.' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Неявка' }));

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(/Запись пациента Кузнецов А\. получит статус/);
  });

  it('should close the dialog when the no-show was recorded', async () => {
    renderMenu();
    const dialog = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить неявку' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('should explain that the appointment is no longer booked when the service answers 409 CONFLICT', async () => {
    apiFetchMock.mockRejectedValue(problem(409, 'CONFLICT'));
    renderMenu();
    const dialog = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить неявку' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Запись уже не в статусе');
  });

  it('should explain why and refresh the journal when the service answers 409 ENCOUNTER_STATE_INVALID for a visit with an encounter', async () => {
    apiFetchMock.mockRejectedValue(problem(409, 'ENCOUNTER_STATE_INVALID'));
    const client = newQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    renderWithClient(<NoshowMenu appointmentId="a1" />, client);
    const dialog = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить неявку' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('по ней уже открыт или завершён приём');
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it('should keep the dialog open and show the message when the request fails with a server error', async () => {
    apiFetchMock.mockRejectedValue(problem(500, 'INTERNAL'));
    renderMenu();
    const dialog = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить неявку' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Внутренняя ошибка');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('should return focus to the menu button when the dialog is cancelled', async () => {
    renderMenu();
    const dialog = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));

    expect(screen.getByRole('button', { name: 'Действия с записью' })).toHaveFocus();
  });

  it('should close the dialog and return focus when Escape is pressed', async () => {
    renderMenu();
    await openDialog();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Действия с записью' })).toHaveFocus();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should move focus to the patient link of the row when the no-show was recorded', async () => {
    renderInRow();
    const dialog = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить неявку' }));

    await waitFor(() => expect(screen.getByRole('link', { name: 'Кузнецов А.' })).toHaveFocus());
  });

  it('should keep focus where it is when the no-show failed', async () => {
    apiFetchMock.mockRejectedValue(problem(500, 'INTERNAL'));
    renderInRow();
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить неявку' }));
    await screen.findByRole('alert');

    expect(screen.getByRole('link', { name: 'Кузнецов А.' })).not.toHaveFocus();
  });
});
