jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { bodyOf, callsTo, newQueryClient, problem, renderWithClient, routeApi, type ApiMock, type ApiRoute } from './doctor-test-utils';
import { OpenEncounterButton } from './open-encounter-button';

const apiFetchMock = apiFetch as ApiMock;
const APPOINTMENT_ID = 'appt-77';
const ENCOUNTER_ID = 'enc-5001';

function openRoute(respond: ApiRoute['respond']): ApiRoute {
  return { method: 'POST', path: '/api/v1/encounters', respond };
}

function historyRoute(items: ReadonlyArray<{ id: string; appointmentId: string }>): ApiRoute {
  return { path: '/api/v1/patients/p1/history', respond: () => ({ items, meta: { page: 1, pageSize: 100, totalItems: items.length, totalPages: 1 } }) };
}

function setup(routes: ReadonlyArray<ApiRoute>): void {
  apiFetchMock.mockReset();
  push.mockReset();
  routeApi(apiFetchMock, routes);
  renderWithClient(<OpenEncounterButton appointmentId={APPOINTMENT_ID} patientId="p1" label="Кузнецов, 09:00" />);
}

const click = (): Promise<void> => userEvent.click(screen.getByRole('button', { name: 'Открыть приём: Кузнецов, 09:00' }));

describe('OpenEncounterButton', () => {
  it('should create the encounter from the appointment id and go to the id of the encounter, not of the appointment', async () => {
    setup([openRoute(() => ({ id: ENCOUNTER_ID, status: 'in-progress' }))]);

    await click();

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}`));
    expect(bodyOf(callsTo(apiFetchMock, '/api/v1/encounters', 'POST')[0])).toEqual({ appointmentId: APPOINTMENT_ID });
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining(APPOINTMENT_ID));
  });

  it('should re-enter the open encounter when the service answers with the one that already exists', async () => {
    setup([openRoute(() => ({ id: 'enc-already-open', status: 'in-progress' }))]);

    await click();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/encounters/enc-already-open'));
  });

  it('should percent-encode the encounter id when it contains reserved characters', async () => {
    setup([openRoute(() => ({ id: 'a/b', status: 'in-progress' }))]);

    await click();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/encounters/a%2Fb'));
  });

  it('should open the finished record found in the history when the service answers 409 for a completed appointment', async () => {
    setup([
      openRoute(() => { throw problem(409, 'ENCOUNTER_STATE_INVALID'); }),
      historyRoute([{ id: 'enc-other', appointmentId: 'appt-1' }, { id: 'enc-done', appointmentId: APPOINTMENT_ID }]),
    ]);

    await click();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/encounters/enc-done'));
  });

  it('should explain the conflict and stay put when the finished encounter cannot be found in the history', async () => {
    setup([openRoute(() => { throw problem(409, 'ENCOUNTER_STATE_INVALID'); }), historyRoute([])]);

    await click();

    expect(await screen.findByRole('alert')).toHaveTextContent('уже оформлен');
    expect(push).not.toHaveBeenCalled();
  });

  it('should keep the original conflict when the history cannot be read either', async () => {
    setup([openRoute(() => { throw problem(409, 'ENCOUNTER_STATE_INVALID'); }), { path: '/api/v1/patients/p1/history', respond: () => { throw problem(500, 'INTERNAL'); } }]);

    await click();

    expect(await screen.findByRole('alert')).toHaveTextContent('уже оформлен');
    expect(push).not.toHaveBeenCalled();
  });

  it('should show the localized message and not navigate when the appointment is not found', async () => {
    setup([openRoute(() => { throw problem(404, 'NOT_FOUND'); })]);

    await click();

    expect(await screen.findByRole('alert')).toHaveTextContent('Не найдено');
    expect(push).not.toHaveBeenCalled();
  });

  it('should disable the button while the encounter is being created', async () => {
    let finish: (value: unknown) => void = () => undefined;
    setup([openRoute(() => new Promise((resolve) => { finish = resolve; }))]);

    await click();

    expect(await screen.findByRole('button', { name: /Открыть приём: Кузнецов/ })).toBeDisabled();
    expect(screen.getByRole('button')).toHaveTextContent('Открываем…');
    finish({ id: ENCOUNTER_ID, status: 'in-progress' });
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it('should refresh the journal and the encounters when the encounter was created', async () => {
    const client = newQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    apiFetchMock.mockReset();
    push.mockReset();
    routeApi(apiFetchMock, [openRoute(() => ({ id: ENCOUNTER_ID, status: 'in-progress' }))]);
    renderWithClient(<OpenEncounterButton appointmentId={APPOINTMENT_ID} patientId="p1" label="Кузнецов, 09:00" />, client);

    await click();

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['doctorAppointments'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['encounter'] });
  });
  describe('without a consent (409 CONSENT_REQUIRED)', () => {
    const refuse = (): never => { throw problem(409, 'CONSENT_REQUIRED'); };

    it('should say the patient has no consent in a dialog, offer the record form, and not leave the journal', async () => {
      setup([openRoute(refuse)]);

      await click();

      const dialog = await screen.findByRole('dialog', { name: 'Нет согласия на электронную медкарту' });
      expect(dialog).toHaveTextContent('Приём нельзя открыть');
      expect(screen.getByRole('link', { name: 'Внести согласие в карточке пациента' })).toHaveAttribute('href', '/patients/p1#consent');
      expect(push).not.toHaveBeenCalled();
    });

    it('should resend with the emergency reason and go to the encounter when the doctor opens it as emergency care', async () => {
      let attempts = 0;
      setup([openRoute((_path, options) => {
        attempts += 1;
        if (attempts === 1) return refuse();
        expect(JSON.parse(String(options?.body))).toEqual({ appointmentId: APPOINTMENT_ID, emergencyReason: 'Пациент без сознания, ДТП' });
        return { id: ENCOUNTER_ID, status: 'in-progress' };
      })]);

      await click();
      await userEvent.click(await screen.findByLabelText('Причина экстренной помощи'));
      await userEvent.paste('Пациент без сознания, ДТП');
      await userEvent.click(screen.getByRole('button', { name: 'Открыть приём как экстренный' }));

      await waitFor(() => expect(push).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}`));
      expect(callsTo(apiFetchMock, '/api/v1/encounters', 'POST')).toHaveLength(2);
    });

    it('should keep the dialog up with the busy button while the emergency request runs', async () => {
      let attempts = 0;
      let finish: (value: unknown) => void = () => undefined;
      setup([openRoute(() => {
        attempts += 1;
        if (attempts === 1) return refuse();
        return new Promise((done) => { finish = done; });
      })]);

      await click();
      await userEvent.click(await screen.findByLabelText('Причина экстренной помощи'));
      await userEvent.paste('Пациент без сознания, ДТП');
      await userEvent.click(screen.getByRole('button', { name: 'Открыть приём как экстренный' }));

      expect(await screen.findByRole('button', { name: 'Отправляем…' })).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      finish({ id: ENCOUNTER_ID, status: 'in-progress' });
      await waitFor(() => expect(push).toHaveBeenCalledWith(`/encounters/${ENCOUNTER_ID}`));
    });

    it('should show why the emergency request failed inside the dialog', async () => {
      let attempts = 0;
      setup([openRoute(() => {
        attempts += 1;
        if (attempts === 1) return refuse();
        throw problem(400, 'VALIDATION_ERROR');
      })]);

      await click();
      await userEvent.click(await screen.findByLabelText('Причина экстренной помощи'));
      await userEvent.paste('Пациент без сознания, ДТП');
      await userEvent.click(screen.getByRole('button', { name: 'Открыть приём как экстренный' }));

      expect(await screen.findByText('Проверьте заполнение полей')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not send a first request with an emergency reason', async () => {
      setup([openRoute(() => ({ id: ENCOUNTER_ID, status: 'in-progress' }))]);

      await click();

      await waitFor(() => expect(push).toHaveBeenCalled());
      expect(bodyOf(callsTo(apiFetchMock, '/api/v1/encounters', 'POST')[0])).not.toHaveProperty('emergencyReason');
    });

    it('should close the dialog on Escape and leave the button usable', async () => {
      setup([openRoute(refuse)]);

      await click();
      await screen.findByRole('dialog');
      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Открыть приём: Кузнецов, 09:00' })).toBeInTheDocument();
    });
  });
});
