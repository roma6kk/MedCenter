import { FhirHttp, type FhirResource } from '../shared/fhir-http';
import { InMemoryFhirServer } from '../shared/in-memory-fhir';
import {
  countConcepts,
  isLegacySeedCopy,
  isTermIndexedCodeSystem,
  planCanonicalUpsert,
  upsertCanonical,
  type CanonicalResource,
} from './canonical-upsert';

const URL = 'https://fhir.by/CodeSystem/nsi-services';

function concepts(count: number): Array<{ code: string; display: string }> {
  return Array.from({ length: count }, (_, index) => ({ code: `C${index}`, display: `Concept ${index}` }));
}

/** The seed's snapshot has 10 concepts. */
function fragment(id: string): CanonicalResource {
  return { resourceType: 'CodeSystem', id, url: URL, content: 'fragment', concept: concepts(10) };
}

function legacy(id: string, content: string, listed = 10): FhirResource {
  return { resourceType: 'CodeSystem', id, url: URL, content, ...(listed === 0 ? {} : { concept: concepts(listed) }) };
}

describe('isTermIndexedCodeSystem', () => {
  it.each(['complete', 'not-present', undefined])('should treat content %s as term-indexed', (content) => {
    expect(isTermIndexedCodeSystem({ resourceType: 'CodeSystem', content })).toBe(true);
  });

  it.each(['fragment', 'example', 'supplement'])('should not treat content %s as term-indexed', (content) => {
    expect(isTermIndexedCodeSystem({ resourceType: 'CodeSystem', content })).toBe(false);
  });

  it('should ignore resources that are not CodeSystems', () => {
    expect(isTermIndexedCodeSystem({ resourceType: 'ValueSet' })).toBe(false);
  });
});

describe('planCanonicalUpsert', () => {
  it('should create the deterministic id when the canonical is unknown', () => {
    expect(planCanonicalUpsert(fragment('cs-nsi'), [])).toEqual({ id: 'cs-nsi', action: 'created', retireIds: [] });
  });

  it('should update the id that already holds the canonical', () => {
    const plan = planCanonicalUpsert(fragment('cs-nsi'), [legacy('1002', 'fragment')]);

    expect(plan).toEqual({ id: '1002', action: 'updated', retireIds: [] });
  });

  it('should retire a legacy complete copy that lists no more concepts than the snapshot', () => {
    const plan = planCanonicalUpsert(fragment('cs-nsi'), [legacy('1000', 'complete', 7)]);

    expect(plan).toEqual({ id: 'cs-nsi', action: 'created', retireIds: ['1000'] });
  });

  it('should refuse to retire a complete copy that lists more concepts than the snapshot when it may be a real import', () => {
    expect(() => planCanonicalUpsert(fragment('cs-nsi'), [legacy('1000', 'complete', 11)])).toThrow(
      /may be a real terminology import.*refuses to delete/,
    );
  });

  it('should refuse to retire a not-present copy because its concepts live only in the HAPI term tables', () => {
    expect(() => planCanonicalUpsert(fragment('cs-nsi'), [legacy('1000', 'not-present', 0)])).toThrow(
      /content not-present/,
    );
  });

  it('should refuse to retire a complete copy that lists no concepts when nothing proves it is the seed copy', () => {
    expect(() => planCanonicalUpsert(fragment('cs-nsi'), [legacy('1000', 'complete', 0)])).toThrow(/0 concepts listed/);
  });

  it('should name the id and the canonical when it refuses', () => {
    expect(() => planCanonicalUpsert(fragment('cs-nsi'), [legacy('4711', 'complete', 500)])).toThrow(
      new RegExp(`CodeSystem/4711 \\(${URL}\\)`),
    );
  });

  it('should keep a ValueSet that already exists', () => {
    const desired: CanonicalResource = { resourceType: 'ValueSet', id: 'vs-icd10', url: 'https://fhir.by/ValueSet/x' };
    const existing: FhirResource = { resourceType: 'ValueSet', id: '1004', url: desired.url };

    expect(planCanonicalUpsert(desired, [existing])).toEqual({ id: '1004', action: 'updated', retireIds: [] });
  });

  it('should refuse to guess between two surviving copies of one canonical', () => {
    expect(() => planCanonicalUpsert(fragment('cs-nsi'), [legacy('1', 'fragment'), legacy('2', 'example')])).toThrow(
      /exists 2 times/,
    );
  });
});

describe('countConcepts', () => {
  it('should count nested concepts as well as top-level ones', () => {
    const system = { resourceType: 'CodeSystem', concept: [{ code: 'A', concept: [{ code: 'A1' }, { code: 'A2' }] }, { code: 'B' }] };

    expect(countConcepts(system)).toBe(4);
  });

  it('should count zero when the body lists no concepts', () => {
    expect(countConcepts({ resourceType: 'CodeSystem' })).toBe(0);
  });
});

describe('isLegacySeedCopy', () => {
  it('should accept a complete copy with as many concepts as the snapshot', () => {
    expect(isLegacySeedCopy(legacy('1', 'complete', 10), fragment('cs'))).toBe(true);
  });

  it('should reject a fragment copy because only complete copies are retired', () => {
    expect(isLegacySeedCopy(legacy('1', 'fragment', 5), fragment('cs'))).toBe(false);
  });
});

describe('upsertCanonical against a server that holds a real import', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('should leave the server untouched when the existing copy is not recognisably the seed copy', async () => {
    // Arrange
    const server = new InMemoryFhirServer();
    server.preload(legacy('real-import', 'complete', 500));

    // Act
    const attempt = upsertCanonical(new FhirHttp('http://fhir.test/fhir', server.fetch), fragment('cs-nsi'));

    // Assert
    await attempt.then(
      () => {
        throw new Error('expected the upsert to be refused');
      },
      (error: unknown) => expect(String(error)).toContain('refuses to delete'),
    );
    expect(server.all('CodeSystem').map((system) => system.id)).toEqual(['real-import']);
    expect(server.requests.filter((request) => request.method !== 'GET')).toEqual([]);
  });

  it('should retire the seed legacy copy and create the deterministic id when the copy is recognisable', async () => {
    const server = new InMemoryFhirServer();
    server.preload(legacy('1000', 'complete', 10));

    await upsertCanonical(new FhirHttp('http://fhir.test/fhir', server.fetch), fragment('cs-nsi'));

    expect(server.all('CodeSystem').map((system) => [system.id, system['content']])).toEqual([['cs-nsi', 'fragment']]);
  });
});
