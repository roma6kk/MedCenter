/** @jest-environment node */
import { publicApiFetch } from './server-fetch';

const fetchMock = jest.fn();

function answer(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('publicApiFetch', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('should answer from the revalidating cache when the list has items', async () => {
    fetchMock.mockResolvedValue(answer({ items: [{ id: 'd1' }], meta: {} }));

    const result = await publicApiFetch('/api/v1/doctors');

    expect(result).toEqual({ ok: true, data: { items: [{ id: 'd1' }], meta: {} } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ next: { revalidate: 300 } });
  });

  it('should ask again past the cache when the cached answer is an empty list, so freshly seeded data shows at once', async () => {
    fetchMock.mockResolvedValueOnce(answer({ items: [], meta: {} })).mockResolvedValueOnce(answer({ items: [{ id: 'd1' }], meta: {} }));

    const result = await publicApiFetch('/api/v1/doctors');

    expect(result).toEqual({ ok: true, data: { items: [{ id: 'd1' }], meta: {} } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ cache: 'no-store' });
  });

  it('should treat a bare empty array as empty too', async () => {
    fetchMock.mockResolvedValueOnce(answer([])).mockResolvedValueOnce(answer([{ id: 's1' }]));

    expect(await publicApiFetch('/api/v1/services')).toEqual({ ok: true, data: [{ id: 's1' }] });
  });

  it('should not ask a third time when the fresh answer is empty as well', async () => {
    fetchMock.mockResolvedValue(answer({ items: [], meta: {} }));

    await publicApiFetch('/api/v1/doctors');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should not retry an object that is not a list when the answer has no items field', async () => {
    fetchMock.mockResolvedValue(answer({ id: 'd1' }));

    await publicApiFetch('/api/v1/doctors/d1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should return the status when the API refuses the request', async () => {
    fetchMock.mockResolvedValue(answer({}, false, 503));

    expect(await publicApiFetch('/api/v1/doctors')).toEqual({ ok: false, status: 503 });
  });

  it('should return a failure without status when the API cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('down'));

    expect(await publicApiFetch('/api/v1/doctors')).toEqual({ ok: false });
  });
});
