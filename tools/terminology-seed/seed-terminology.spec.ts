import { FhirHttp, FhirHttpError, type FetchLike } from '../shared/fhir-http';
import { InMemoryFhirServer } from '../shared/in-memory-fhir';
import { expansionCodes, findMissingCodes, seedTerminology, type VerifyOptions } from './seed-terminology';
import { buildCodeSystems, buildValueSets, TERMINOLOGY_URLS } from './terminology-resources';

const NO_WAIT: VerifyOptions = { attempts: 3, delayMs: 0, sleep: () => Promise.resolve() };

function silenceConsole(): void {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
}

function seed(fetch: FetchLike, options: VerifyOptions = NO_WAIT): ReturnType<typeof seedTerminology> {
  return seedTerminology(new FhirHttp('http://fhir.test/fhir', fetch), options);
}

async function withoutFirstExpansionCode(response: Response): Promise<Response> {
  const body = (await response.json()) as { expansion: { contains: unknown[] } };
  return new Response(JSON.stringify({ ...body, expansion: { contains: body.expansion.contains.slice(1) } }));
}

interface StaleOptions {
  readonly onDelete?: (url: string) => void;
  readonly refreshesOn?: (url: string) => boolean;
}

function atcExpansionStaleUntilDelete(server: InMemoryFhirServer, { onDelete, refreshesOn }: StaleOptions = {}): FetchLike {
  let stale = true;
  return async (url, init) => {
    if ((init?.method ?? 'GET') === 'DELETE') {
      onDelete?.(url);
      if (refreshesOn?.(url) ?? true) stale = false;
    }
    const response = await server.fetch(url, init);
    return stale && url.includes('$expand') && url.includes('atc') ? withoutFirstExpansionCode(response) : response;
  };
}

function counts(server: InMemoryFhirServer): Record<string, number> {
  return { CodeSystem: server.count('CodeSystem'), ValueSet: server.count('ValueSet') };
}

describe('expansionCodes', () => {
  it('should collect nested codes of a hierarchical expansion', () => {
    const valueSet = {
      resourceType: 'ValueSet',
      expansion: { contains: [{ code: 'I10', contains: [{ code: 'I10.1' }] }, { code: 'J06' }] },
    };

    expect([...expansionCodes(valueSet)].sort()).toEqual(['I10', 'I10.1', 'J06']);
  });

  it('should return no codes when the ValueSet is not expanded', () => {
    expect(expansionCodes({ resourceType: 'ValueSet' }).size).toBe(0);
  });
});

describe('findMissingCodes', () => {
  it('should name the expected codes the expansion lacks', () => {
    const valueSet = { resourceType: 'ValueSet', expansion: { contains: [{ code: 'A' }] } };

    expect(findMissingCodes(valueSet, ['A', 'B', 'C'])).toEqual(['B', 'C']);
  });
});

describe('seedTerminology', () => {
  beforeEach(silenceConsole);
  afterEach(() => jest.restoreAllMocks());

  it('should publish every CodeSystem and ValueSet of the snapshot on an empty server', async () => {
    const server = new InMemoryFhirServer();

    await seed(server.fetch);

    expect(counts(server)).toEqual({ CodeSystem: buildCodeSystems().length, ValueSet: buildValueSets().length });
  });

  it('should leave counts and versions unchanged on a second run', async () => {
    const server = new InMemoryFhirServer();
    const http = new FhirHttp('http://fhir.test/fhir', server.fetch);
    await seedTerminology(http, NO_WAIT);
    const before = counts(server);
    const version = server.versionOf('CodeSystem', 'cs-icd10');

    await seedTerminology(http, NO_WAIT);

    expect(counts(server)).toEqual(before);
    expect(server.versionOf('CodeSystem', 'cs-icd10')).toBe(version);
  });

  it('should never POST a resource', async () => {
    const server = new InMemoryFhirServer();

    await seed(server.fetch);

    expect(server.requests.filter((request) => request.method === 'POST')).toEqual([]);
  });

  it('should adopt the server-assigned id of a legacy fragment copy instead of duplicating it', async () => {
    const server = new InMemoryFhirServer();
    server.preload({ resourceType: 'CodeSystem', id: '1002', url: TERMINOLOGY_URLS.ATC_CODE_SYSTEM, content: 'example' });

    await seed(server.fetch);

    const atc = server.all('CodeSystem').filter((system) => system['url'] === TERMINOLOGY_URLS.ATC_CODE_SYSTEM);
    expect(atc.map((system) => system.id)).toEqual(['1002']);
  });

  it('should retire a legacy complete CodeSystem so the canonical stays unique', async () => {
    const server = new InMemoryFhirServer();
    server.preload({
      resourceType: 'CodeSystem',
      id: '1003',
      url: TERMINOLOGY_URLS.ICD10_CODE_SYSTEM,
      content: 'complete',
      concept: [{ code: 'J06.9', display: 'Острая инфекция верхних дыхательных путей неуточнённая' }],
    });

    await seed(server.fetch);

    const icd10 = server.all('CodeSystem').filter((system) => system['url'] === TERMINOLOGY_URLS.ICD10_CODE_SYSTEM);
    expect(icd10.map((system) => [system.id, system['content']])).toEqual([['cs-icd10', 'fragment']]);
  });

  it('should fail when a ValueSet never expands to its snapshot', async () => {
    const server = new InMemoryFhirServer();
    const truncated: FetchLike = async (url, init) => {
      const response = await server.fetch(url, init);
      return url.includes('$expand') ? withoutFirstExpansionCode(response) : response;
    };

    await expect(seed(truncated)).rejects.toThrow(
      /expansion is incomplete/,
    );
  });

  describe('$expand answering a server error right after a ValueSet PUT', () => {
    function flaky(
      server: InMemoryFhirServer,
      failures: number,
      status: number,
      match: string = '$expand',
      body: unknown = { resourceType: 'OperationOutcome' },
    ): { fetch: FetchLike; failed: () => number } {
      let failed = 0;
      return {
        failed: () => failed,
        fetch: async (url, init) => {
          if (url.includes(match) && failed < failures) {
            failed += 1;
            return new Response(JSON.stringify(body), { status });
          }
          return server.fetch(url, init);
        },
      };
    }

    it('should retry with a growing pause and then succeed when the 5xx is transient', async () => {
      const server = new InMemoryFhirServer();
      const pauses: number[] = [];
      const options: VerifyOptions = { ...NO_WAIT, serverErrorDelayMs: 100, sleep: (ms) => { pauses.push(ms); return Promise.resolve(); } };
      const { fetch, failed } = flaky(server, 3, 503);

      await seed(fetch, options);

      expect(failed()).toBe(3);
      expect(pauses).toEqual([100, 200, 400]);
    });

    it('should give up after a bounded number of attempts when the 5xx persists', async () => {
      const server = new InMemoryFhirServer();
      const { fetch, failed } = flaky(server, 1000, 500);

      await expect(seed(fetch)).rejects.toBeInstanceOf(FhirHttpError);
      expect(failed()).toBe(7);
    });

    it('should cap a single pause so the budget covers the HAPI cache', async () => {
      const server = new InMemoryFhirServer();
      const pauses: number[] = [];
      const options: VerifyOptions = { ...NO_WAIT, sleep: (ms) => { pauses.push(ms); return Promise.resolve(); } };
      const { fetch } = flaky(server, 6, 503);

      await seed(fetch, options);

      expect(pauses).toEqual([1000, 2000, 4000, 8000, 16000, 16000]);
    });

    it('should retry HAPI-2788 whatever the status', async () => {
      const server = new InMemoryFhirServer();
      const outcome = { resourceType: 'OperationOutcome', issue: [{ diagnostics: 'HAPI-2788: Unable to find ValueSet' }] };
      const { fetch, failed } = flaky(server, 2, 404, '$expand', outcome);

      await seed(fetch);

      expect(failed()).toBe(2);
    });

    it('should retry a 503 of $validate-code', async () => {
      const server = new InMemoryFhirServer();
      const { fetch, failed } = flaky(server, 1, 503, '$validate-code');

      await seed(fetch);

      expect(failed()).toBe(1);
    });

    it('should not retry a 4xx', async () => {
      const server = new InMemoryFhirServer();
      const { fetch, failed } = flaky(server, 1000, 404);

      await expect(seed(fetch)).rejects.toBeInstanceOf(FhirHttpError);
      expect(failed()).toBe(1);
    });
  });

  it('should recreate a ValueSet whose stored expansion is stale and then succeed', async () => {
    const server = new InMemoryFhirServer();

    await seed(atcExpansionStaleUntilDelete(server, { refreshesOn: (url) => url.includes('/ValueSet/') }));

    expect(server.count('ValueSet')).toBe(buildValueSets().length);
  });

  it('should recreate a stale ValueSet under the server id it adopted and not leave a second copy', async () => {
    const server = new InMemoryFhirServer();
    server.preload({ resourceType: 'ValueSet', id: '1004', url: TERMINOLOGY_URLS.ATC_VALUE_SET, status: 'draft' });
    const deleted: string[] = [];

    await seed(atcExpansionStaleUntilDelete(server, { onDelete: (url) => deleted.push(url) }));

    expect(deleted).toEqual(['http://fhir.test/fhir/ValueSet/1004']);
    const atc = server.all('ValueSet').filter((valueSet) => valueSet['url'] === TERMINOLOGY_URLS.ATC_VALUE_SET);
    expect(atc.map((valueSet) => valueSet.id)).toEqual(['1004']);
  });

  it('should write nothing when a CodeSystem it would have to delete is not recognisably its own copy', async () => {
    const server = new InMemoryFhirServer();
    server.preload({
      resourceType: 'CodeSystem',
      id: 'real-icd10',
      url: TERMINOLOGY_URLS.ICD10_CODE_SYSTEM,
      content: 'complete',
      concept: Array.from({ length: 500 }, (_, index) => ({ code: `X${index}`, display: `Real concept ${index}` })),
    });

    const attempt = seed(server.fetch);

    await expect(attempt).rejects.toThrow(/refuses to delete/);
    expect(server.requests.filter((request) => request.method !== 'GET')).toEqual([]);
    expect(server.all('CodeSystem').map((system) => system.id)).toEqual(['real-icd10']);
  });

  it('should prove J06.9, J01FA10 and Cel and report every ValueSet as validated', async () => {
    const server = new InMemoryFhirServer();

    const summary = await seed(server.fetch);

    expect(summary.keyCodes.map((proof) => proof.code)).toEqual(['J06.9', 'J01FA10', 'Cel']);
    expect(summary.expansions.every((report) => report.rejectedCodes.length === 0)).toBe(true);
  });

  it('should fail when $validate-code refuses a snapshot code', async () => {
    const server = new InMemoryFhirServer();
    const refusing: FetchLike = async (url, init) => {
      if (!url.includes('$validate-code') || !url.includes('code=J06.9')) {
        return server.fetch(url, init);
      }
      return new Response(JSON.stringify({ resourceType: 'Parameters', parameter: [{ name: 'result', valueBoolean: false }] }));
    };

    await expect(seed(refusing)).rejects.toThrow(
      /\$validate-code rejects snapshot codes/,
    );
  });
});
