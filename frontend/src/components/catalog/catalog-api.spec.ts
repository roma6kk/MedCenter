jest.mock('@/lib/api/api-fetch', () => ({ apiFetch: jest.fn() }));

import { apiFetch } from '@/lib/api/api-fetch';
import { fetchDoctor, fetchDoctorSlots, fetchDoctors, fetchService, fetchServices } from './catalog-api';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string) => Promise<unknown>>;
const META = { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 };

describe('catalog-api', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should read the services in one page of the catalog size when they are fetched', async () => {
    apiFetchMock.mockResolvedValue({ items: [{ id: 's' }], meta: META });

    const page = await fetchServices();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/services?pageSize=100');
    expect(page.items).toHaveLength(1);
  });

  it('should wrap a bare array into a page when an older list endpoint answers without an envelope', async () => {
    apiFetchMock.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);

    const page = await fetchDoctors();

    expect(page.items).toHaveLength(2);
    expect(page.meta.totalItems).toBe(2);
  });

  it('should pass the service and search filters to the doctor list when doctors are fetched with them', async () => {
    apiFetchMock.mockResolvedValue({ items: [], meta: META });

    await fetchDoctors({ serviceId: 'svc-1', search: 'Иван' });

    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('serviceId=svc-1'));
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('search=%D0%98%D0%B2%D0%B0%D0%BD'));
  });

  it('should encode the ids when a single service and a single doctor are fetched', async () => {
    apiFetchMock.mockResolvedValue({});

    await fetchService('a/b');
    await fetchDoctor('c d');

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/services/a%2Fb');
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/doctors/c%20d');
  });

  it('should search the free slots of a doctor between two calendar days (API 5.2.8) when the slots are fetched', async () => {
    apiFetchMock.mockResolvedValue({ doctorId: 'doc-1', items: [] });

    await fetchDoctorSlots('doc-1', { from: '2026-10-19', to: '2026-11-01' });

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/doctors/doc-1/slots?from=2026-10-19&to=2026-11-01');
  });

  it('should not ask the old schedule-based slot path when the slots are fetched', async () => {
    apiFetchMock.mockResolvedValue({ doctorId: 'doc-1', items: [] });

    await fetchDoctorSlots('doc-1', { from: '2026-10-19', to: '2026-11-01' });

    expect(apiFetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/schedules/'));
  });
});
