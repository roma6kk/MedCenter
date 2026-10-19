import { cancelAppointment, fetchAppointment, fetchAppointments, listQueryOf } from './appointment-api';

jest.mock('@/lib/api/api-fetch', () => ({ apiFetch: jest.fn() }));

import { apiFetch } from '@/lib/api/api-fetch';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

describe('appointment-api', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({});
  });

  it('should list upcoming appointments soonest first from /appointments, not /me/appointments', async () => {
    await fetchAppointments({ tab: 'upcoming', page: 2, pageSize: 10 });

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/appointments?page=2&pageSize=10&upcoming=true&sortOrder=asc');
  });

  it('should list the whole history newest first without an upcoming flag when the all tab is open', async () => {
    await fetchAppointments({ tab: 'all', page: 1, pageSize: 10 });

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/appointments?page=1&pageSize=10&sortOrder=desc');
  });

  it('should never put a patient parameter into the list query when the compartment comes from the token', () => {
    expect(Object.keys(listQueryOf({ tab: 'upcoming', page: 1, pageSize: 10 }))).not.toContain('patient');
  });

  it('should read one appointment from /appointments/{id} with the id encoded', async () => {
    await fetchAppointment('15 52');

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/appointments/15%2052');
  });

  it('should POST the cancellation reason as JSON to /appointments/{id}/cancel', async () => {
    await cancelAppointment('1552', 'Заболел');

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/appointments/1552/cancel', { method: 'POST', body: '{"reason":"Заболел"}' });
  });
});
