import { FhirHttp, FhirHttpError, type FetchLike } from './fhir-http';

const BASE = 'http://fhir.test/fhir';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('FhirHttp.url', () => {
  it('should append repeated and array parameters without a double slash', () => {
    const http = new FhirHttp(`${BASE}/`);

    expect(http.url('Slot', { status: 'free', start: ['ge2026-10-14', 'le2026-10-20'] })).toBe(
      `${BASE}/Slot?status=free&start=ge2026-10-14&start=le2026-10-20`,
    );
  });
});

describe('FhirHttp.search', () => {
  it('should follow the next links until the result set is exhausted', async () => {
    const pages = [
      { resourceType: 'Bundle', entry: [{ resource: { resourceType: 'Slot', id: 'a' } }], link: [{ relation: 'next', url: `${BASE}?page=2` }] },
      { resourceType: 'Bundle', entry: [{ resource: { resourceType: 'Slot', id: 'b' } }] },
    ];
    const fetchImpl: FetchLike = async () => json(pages.shift());

    const found = await new FhirHttp(BASE, fetchImpl).search('Slot');

    expect(found.map((slot) => slot.id)).toEqual(['a', 'b']);
  });

  it('should stop with an error when the server keeps answering a next link', async () => {
    const endless: FetchLike = async () =>
      json({ resourceType: 'Bundle', link: [{ relation: 'next', url: `${BASE}?again` }] });

    await expect(new FhirHttp(BASE, endless).search('Slot')).rejects.toThrow(/exceeded 50 pages/);
  });
});

describe('FhirHttp requests', () => {
  it('should bypass the server search cache on every request', async () => {
    const seen: Array<Record<string, string>> = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      seen.push(init?.headers as Record<string, string>);
      return json({ resourceType: 'Bundle', total: 3 });
    };

    await new FhirHttp(BASE, fetchImpl).count('Slot', { schedule: 'Schedule/a' });

    expect(seen[0]?.['cache-control']).toBe('no-cache');
  });

  it('should ask only for the total when counting', async () => {
    let requested = '';
    const fetchImpl: FetchLike = async (url) => {
      requested = url;
      return json({ resourceType: 'Bundle', total: 7 });
    };

    const total = await new FhirHttp(BASE, fetchImpl).count('Slot');

    expect(total).toBe(7);
    expect(requested).toBe(`${BASE}/Slot?_summary=count`);
  });

  it('should refuse to PUT a resource without a client-assigned id', async () => {
    await expect(new FhirHttp(BASE, async () => json({})).put({ resourceType: 'Slot' })).rejects.toThrow(/client-assigned id/);
  });

  it('should PUT to <type>/<id> with the resource as the body', async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      return json({ resourceType: 'Slot', id: 'a' });
    };

    await new FhirHttp(BASE, fetchImpl).put({ resourceType: 'Slot', id: 'a', status: 'free' });

    expect(calls).toEqual([{ url: `${BASE}/Slot/a`, method: 'PUT', body: '{"resourceType":"Slot","id":"a","status":"free"}' }]);
  });

  it('should post a transaction Bundle with one request entry per resource', async () => {
    let body: { type?: string; entry?: Array<{ request: { method: string; url: string } }> } = {};
    const fetchImpl: FetchLike = async (_url, init) => {
      body = JSON.parse(init?.body as string);
      return json({ resourceType: 'Bundle', type: 'transaction-response' });
    };

    await new FhirHttp(BASE, fetchImpl).bundle('transaction', [
      { method: 'PUT', url: 'Slot/a', resource: { resourceType: 'Slot', id: 'a' } },
    ]);

    expect(body.type).toBe('transaction');
    expect(body.entry?.[0]?.request).toEqual({ method: 'PUT', url: 'Slot/a' });
  });
});

describe('FhirHttp errors', () => {
  it('should raise a FhirHttpError with the status and an excerpt of the OperationOutcome when the server refuses', async () => {
    const refused: FetchLike = async () => json({ resourceType: 'OperationOutcome', issue: [{ diagnostics: 'HAPI-0524 unknown param' }] }, 400);

    const failure = await new FhirHttp(BASE, refused).search('Location', { x: 'y' }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FhirHttpError);
    expect((failure as FhirHttpError).status).toBe(400);
    expect((failure as FhirHttpError).message).toContain('HAPI-0524');
  });

  it('should reject a body that is not a FHIR resource', async () => {
    const odd: FetchLike = async () => json({ hello: 'world' });

    await expect(new FhirHttp(BASE, odd).operation('ValueSet/$expand')).rejects.toThrow(/non-FHIR body/);
  });
});
