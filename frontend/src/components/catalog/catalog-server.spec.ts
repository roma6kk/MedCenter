jest.mock('@/lib/server-fetch', () => ({ publicApiFetch: jest.fn() }));

import { publicApiFetch } from '@/lib/server-fetch';
import { loadDoctor, loadDoctors, loadServices } from './catalog-server';

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

  it('should encode the id when a single doctor is loaded', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await loadDoctor('x/y');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/doctors/x%2Fy');
  });
});
