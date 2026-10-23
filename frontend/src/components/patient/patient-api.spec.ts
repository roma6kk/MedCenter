import { fetchAccount, fetchMyHistory, fetchMyPrescriptions, fetchPatientProfile, updateMyPhone } from './patient-api';

jest.mock('@/lib/api/api-fetch', () => ({ apiFetch: jest.fn() }));

import { apiFetch } from '@/lib/api/api-fetch';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

describe('patient-api', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({});
  });

  it('should read the history from /me/history with the page', async () => {
    await fetchMyHistory({ page: 2, pageSize: 10 });

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/me/history?page=2&pageSize=10');
  });

  it('should read the prescriptions from /me/prescriptions with the page', async () => {
    await fetchMyPrescriptions({ page: 1, pageSize: 10 });

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/me/prescriptions?page=1&pageSize=10');
  });

  it('should read the account from /me and the FHIR profile from /me/patient', async () => {
    await fetchAccount();
    await fetchPatientProfile();

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, '/api/v1/me');
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/api/v1/me/patient');
  });

  it('should PATCH /me/patient with the phone and the version of the card as If-Match', async () => {
    await updateMyPhone({ phone: '+375291234567', version: '3' });

    const [path, options] = apiFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/v1/me/patient');
    expect(options?.method).toBe('PATCH');
    expect(new Headers(options?.headers).get('If-Match')).toBe('W/"3"');
    expect(JSON.parse(String(options?.body))).toEqual({ phone: '+375291234567' });
  });

  it('should never send a patient id when the compartment comes from the token', async () => {
    await fetchMyHistory({ page: 1, pageSize: 10 });
    await fetchMyPrescriptions({ page: 1, pageSize: 10 });

    apiFetchMock.mock.calls.forEach(([path]) => expect(path).not.toMatch(/patient=|\/patients\//));
  });
});
