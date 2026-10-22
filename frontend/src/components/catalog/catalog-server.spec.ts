jest.mock('@/lib/server-fetch', () => ({ publicApiFetch: jest.fn() }));

import { publicApiFetch } from '@/lib/server-fetch';
import { loadDoctor, loadDoctorPage, loadDoctors, loadServices } from './catalog-server';

const fetchMock = publicApiFetch as jest.MockedFunction<(path: string) => Promise<unknown>>;

describe('catalog-server', () => {
  beforeEach(() => fetchMock.mockReset());

  it('should hand the items of the page envelope to the page when the API answers with an envelope', async () => {
    fetchMock.mockResolvedValue({ ok: true, data: { items: [{ id: 'd1' }], meta: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } } });

    const result = await loadDoctors();

    expect(result).toEqual({ ok: true, data: [{ id: 'd1' }] });
  });

  it('should tolerate a bare array when a service has no envelope yet', async () => {
    fetchMock.mockResolvedValue({ ok: true, data: [{ id: 's1' }] });

    expect(await loadServices()).toEqual({ ok: true, data: [{ id: 's1' }] });
  });

  it('should pass a refusal on as a value with its status when the API refuses the request', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    expect(await loadDoctors()).toEqual({ ok: false, status: 503 });
  });

  it('should send the service and search filters of the doctor list when doctors are loaded with them', async () => {
    fetchMock.mockResolvedValue({ ok: true, data: [] });

    await loadDoctors({ serviceId: 'svc-1', search: 'Ив' });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/serviceId=svc-1.*search=/));
  });

  it('should keep the server page meta and send the specialty and paging when one page of doctors is loaded', async () => {
    const envelope = { items: [{ id: 'd1' }], meta: { page: 2, pageSize: 9, totalItems: 10, totalPages: 2 } };
    fetchMock.mockResolvedValue({ ok: true, data: envelope });

    const result = await loadDoctorPage({ specialty: '419192003', page: 2, pageSize: 9 });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/doctors?specialty=419192003&page=2&pageSize=9');
    expect(result).toEqual({ ok: true, data: envelope });
  });

  it('should encode the id when a single doctor is loaded', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await loadDoctor('x/y');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/doctors/x%2Fy');
  });
});
