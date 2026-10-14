import { FhirHttp, type FetchLike } from '../shared/fhir-http';
import { InMemoryFhirServer } from '../shared/in-memory-fhir';
import { expansionCodes, findMissingCodes, seedTerminology, type VerifyOptions } from './seed-terminology';
import { buildCodeSystems, buildValueSets, TERMINOLOGY_URLS } from './terminology-resources';

const NO_WAIT: VerifyOptions = { attempts: 3, delayMs: 0, sleep: () => Promise.resolve() };

function silenceConsole(): void {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
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

    await seedTerminology(new FhirHttp('http://fhir.test/fhir', server.fetch), NO_WAIT);

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

    await seedTerminology(new FhirHttp('http://fhir.test/fhir', server.fetch), NO_WAIT);

    expect(server.requests.filter((request) => request.method === 'POST')).toEqual([]);
  });

  it('should adopt the server-assigned id of a legacy fragment copy instead of duplicating it', async () => {
    const server = new InMemoryFhirServer();
    server.preload({ resourceType: 'CodeSystem', id: '1002', url: TERMINOLOGY_URLS.ATC_CODE_SYSTEM, content: 'example' });

    await seedTerminology(new FhirHttp('http://fhir.test/fhir', server.fetch), NO_WAIT);

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

    await seedTerminology(new FhirHttp('http://fhir.test/fhir', server.fetch), NO_WAIT);

    const icd10 = server.all('CodeSystem').filter((system) => system['url'] === TERMINOLOGY_URLS.ICD10_CODE_SYSTEM);
    expect(icd10.map((system) => [system.id, system['content']])).toEqual([['cs-icd10', 'fragment']]);
  });

  it('should fail when a ValueSet never expands to its snapshot', async () => {
    const server = new InMemoryFhirServer();
    const truncated: FetchLike = async (url, init) => {
      const response = await server.fetch(url, init);
      if (!url.includes('$expand')) {
        return response;
      }
      const body = (await response.json()) as { expansion: { contains: unknown[] } };
      return new Response(JSON.stringify({ ...body, expansion: { contains: body.expansion.contains.slice(1) } }));
    };

    await expect(seedTerminology(new FhirHttp('http://fhir.test/fhir', truncated), NO_WAIT)).rejects.toThrow(
      /expansion is incomplete/,
    );
  });

  it('should recreate a ValueSet whose stored expansion is stale and then succeed', async () => {
    const server = new InMemoryFhirServer();
    let stale = true;
    const staleOnce: FetchLike = async (url, init) => {
      if ((init?.method ?? 'GET') === 'DELETE' && url.includes('/ValueSet/')) {
        stale = false;
      }
      const response = await server.fetch(url, init);
      if (!stale || !url.includes('$expand') || !url.includes('atc')) {
        return response;
      }
      const body = (await response.json()) as { expansion: { contains: unknown[] } };
      return new Response(JSON.stringify({ ...body, expansion: { contains: body.expansion.contains.slice(1) } }));
    };

    await seedTerminology(new FhirHttp('http://fhir.test/fhir', staleOnce), NO_WAIT);

    expect(server.count('ValueSet')).toBe(buildValueSets().length);
  });

  it('should recreate a stale ValueSet under the server id it adopted and not leave a second copy', async () => {
    // Arrange
    const server = new InMemoryFhirServer();
    server.preload({ resourceType: 'ValueSet', id: '1004', url: TERMINOLOGY_URLS.ATC_VALUE_SET, status: 'draft' });
    const deleted: string[] = [];
    let stale = true;
    const staleOnce: FetchLike = async (url, init) => {
      if ((init?.method ?? 'GET') === 'DELETE') {
        deleted.push(url);
        stale = false;
      }
      const response = await server.fetch(url, init);
      if (!stale || !url.includes('$expand') || !url.includes('atc')) {
        return response;
      }
      const body = (await response.json()) as { expansion: { contains: unknown[] } };
      return new Response(JSON.stringify({ ...body, expansion: { contains: body.expansion.contains.slice(1) } }));
    };

    // Act
    await seedTerminology(new FhirHttp('http://fhir.test/fhir', staleOnce), NO_WAIT);

    // Assert
    expect(deleted).toEqual(['http://fhir.test/fhir/ValueSet/1004']);
    const atc = server.all('ValueSet').filter((valueSet) => valueSet['url'] === TERMINOLOGY_URLS.ATC_VALUE_SET);
    expect(atc.map((valueSet) => valueSet.id)).toEqual(['1004']);
  });

  it('should write nothing when a CodeSystem it would have to delete is not recognisably its own copy', async () => {
    // Arrange
    const server = new InMemoryFhirServer();
    server.preload({
      resourceType: 'CodeSystem',
      id: 'real-icd10',
      url: TERMINOLOGY_URLS.ICD10_CODE_SYSTEM,
      content: 'complete',
      concept: Array.from({ length: 500 }, (_, index) => ({ code: `X${index}`, display: `Real concept ${index}` })),
    });

    // Act
    const attempt = seedTerminology(new FhirHttp('http://fhir.test/fhir', server.fetch), NO_WAIT);

    // Assert
    await expect(attempt).rejects.toThrow(/refuses to delete/);
    expect(server.requests.filter((request) => request.method !== 'GET')).toEqual([]);
    expect(server.all('CodeSystem').map((system) => system.id)).toEqual(['real-icd10']);
  });

  it('should prove J06.9, J01FA10 and Cel and report every ValueSet as validated', async () => {
    const server = new InMemoryFhirServer();

    const summary = await seedTerminology(new FhirHttp('http://fhir.test/fhir', server.fetch), NO_WAIT);

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

    await expect(seedTerminology(new FhirHttp('http://fhir.test/fhir', refusing), NO_WAIT)).rejects.toThrow(
      /\$validate-code rejects snapshot codes/,
    );
  });
});
