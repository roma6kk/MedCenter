import { waitForStack } from './wait-for-stack';

const CONFIG = { baseUrl: 'http://edge', pollTimeoutMs: 300, pollIntervalMs: 5 };
const CAPABILITY_STATEMENT = JSON.stringify({ resourceType: 'CapabilityStatement', status: 'active' });

afterEach(() => jest.restoreAllMocks());

describe('waitForStack', () => {
  it('should wait for HAPI metadata and the auth JWKS, each answering 200', async () => {
    const asked: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      asked.push(String(url));
      return new Response(CAPABILITY_STATEMENT, { status: 200 });
    });

    await waitForStack(CONFIG);

    expect(asked).toEqual(['http://edge/fhir/metadata', 'http://edge/.well-known/jwks.json']);
  });

  it('should keep asking while HAPI is still starting and the edge answers 502 or refuses the connection', async () => {
    let calls = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError('fetch failed');
      }
      return new Response(CAPABILITY_STATEMENT, { status: calls === 2 ? 502 : 200 });
    });

    await waitForStack(CONFIG);

    expect(calls).toBeGreaterThanOrEqual(4);
  });

  it('should not treat a 200 that is not a CapabilityStatement as HAPI being ready', async () => {
    const asked: string[] = [];
    let metadataCalls = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      asked.push(String(url));
      if (!String(url).endsWith('/fhir/metadata')) {
        return new Response('{}', { status: 200 });
      }
      metadataCalls += 1;
      if (metadataCalls === 1) {
        return new Response('<html>Bad Gateway</html>', { status: 200 });
      }
      if (metadataCalls === 2) {
        return new Response(JSON.stringify({ resourceType: 'OperationOutcome' }), { status: 200 });
      }
      return new Response(CAPABILITY_STATEMENT, { status: 200 });
    });

    await waitForStack(CONFIG);

    expect(metadataCalls).toBe(3);
    expect(asked.filter((url) => url.endsWith('/.well-known/jwks.json'))).toHaveLength(1);
  });

  it('should give up with the address it was waiting for when the stack never answers', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('', { status: 503 }));

    await expect(waitForStack({ ...CONFIG, pollTimeoutMs: 30 })).rejects.toThrow('/fhir/metadata on http://edge did not show up');
  });

  it('should give up when HAPI answers 200 with a body that is never a CapabilityStatement', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('{}', { status: 200 }));

    await expect(waitForStack({ ...CONFIG, pollTimeoutMs: 30 })).rejects.toThrow('/fhir/metadata on http://edge did not show up');
  });
});
