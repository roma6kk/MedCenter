import { readinessChecksFromEnv, runReadiness } from './readiness';

describe('runReadiness', () => {
  it('should be ok when every check passes', async () => {
    const report = await runReadiness([{ name: 'a', run: async () => undefined }]);

    expect(report).toEqual({ ok: true, failed: [] });
  });

  it('should name only the failed and the timed-out dependencies', async () => {
    const report = await runReadiness(
      [
        { name: 'hapi', run: async () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5')) },
        { name: 'slow', run: () => new Promise<void>(() => undefined) },
        { name: 'fine', run: async () => undefined },
      ],
      30,
    );

    expect(report).toEqual({ ok: false, failed: ['hapi', 'slow'] });
  });
});

describe('readinessChecksFromEnv', () => {
  it('should skip a dependency whose variable is unset', () => {
    expect(readinessChecksFromEnv(['hapi', 'redis', 'rabbitmq', 'postgres'], {})).toEqual([]);
  });

  it('should probe HAPI through /metadata and fail on a 5xx', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return { ok: false, status: 503 };
    }) as unknown as typeof fetch;
    const [check] = readinessChecksFromEnv(['hapi'], { FHIR_BASE_URL: 'http://hapi:8080/fhir/' }, fetchImpl);

    await expect(check.run(new AbortController().signal)).rejects.toThrow('503');
    expect(calls[0]).toBe('http://hapi:8080/fhir/metadata?_summary=true');
  });

  it('should fail a TCP check on a closed port', async () => {
    const [check] = readinessChecksFromEnv(['redis'], { REDIS_URL: 'redis://127.0.0.1:1' });

    expect(check.name).toBe('redis');
    await expect(check.run(new AbortController().signal)).rejects.toBeDefined();
  });
});
