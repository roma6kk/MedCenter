import type { FhirResource } from '@medcenter/fhir';

import { isTermIndexedCodeSystem, planCanonicalUpsert, upsertCanonical, type CanonicalResource } from './canonical-upsert';
import { createFakeTerminologyHapi } from './__tests__/fake-terminology-hapi';

const URL = 'https://fhir.by/CodeSystem/nsi-services';
const FRAGMENT: CanonicalResource = { resourceType: 'CodeSystem', id: 'cs-nsi-services', url: URL, content: 'fragment' };
const LEGACY_COMPLETE: FhirResource = { resourceType: 'CodeSystem', id: '1002', url: URL, content: 'complete' };

describe('isTermIndexedCodeSystem', () => {
  it.each([['complete'], ['not-present'], [undefined]])(
    'should flag a CodeSystem whose content is %s when HAPI indexes it into its terminology tables',
    (content) => {
      expect(isTermIndexedCodeSystem({ resourceType: 'CodeSystem', content })).toBe(true);
    },
  );

  it('should not flag a fragment CodeSystem or another resource type', () => {
    expect(isTermIndexedCodeSystem({ resourceType: 'CodeSystem', content: 'fragment' })).toBe(false);
    expect(isTermIndexedCodeSystem({ resourceType: 'ValueSet' })).toBe(false);
  });
});

describe('planCanonicalUpsert', () => {
  it('should create the deterministic id when the canonical is not on the server', () => {
    expect(planCanonicalUpsert(FRAGMENT, [])).toEqual({ id: 'cs-nsi-services', action: 'created', retireIds: [] });
  });

  it('should update the copy that already holds the canonical when one exists', () => {
    const existing: FhirResource = { resourceType: 'CodeSystem', id: '1004', url: URL, content: 'fragment' };

    expect(planCanonicalUpsert(FRAGMENT, [existing])).toEqual({ id: '1004', action: 'updated', retireIds: [] });
  });

  it('should retire a legacy complete copy and create the deterministic id when a fragment is imported', () => {
    expect(planCanonicalUpsert(FRAGMENT, [LEGACY_COMPLETE])).toEqual({
      id: 'cs-nsi-services',
      action: 'created',
      retireIds: ['1002'],
    });
  });

  it('should refuse when the canonical exists more than once and none is a legacy copy', () => {
    const copies: FhirResource[] = [
      { resourceType: 'CodeSystem', id: 'a', url: URL, content: 'fragment' },
      { resourceType: 'CodeSystem', id: 'b', url: URL, content: 'fragment' },
    ];

    expect(() => planCanonicalUpsert(FRAGMENT, copies)).toThrow('exists 2 times (ids a, b)');
  });
});

describe('upsertCanonical', () => {
  it('should write the resource under its deterministic id when HAPI holds nothing', async () => {
    const fhir = createFakeTerminologyHapi();

    const result = await upsertCanonical(fhir, FRAGMENT);

    expect(result).toMatchObject({ resourceType: 'CodeSystem', id: 'cs-nsi-services', action: 'created' });
    expect(fhir.store.get('CodeSystem/cs-nsi-services')).toMatchObject({ url: URL });
  });

  it('should update in place and never duplicate when the import is repeated', async () => {
    const fhir = createFakeTerminologyHapi();
    await upsertCanonical(fhir, FRAGMENT);

    const second = await upsertCanonical(fhir, FRAGMENT);

    expect(second.action).toBe('updated');
    expect(fhir.store.size).toBe(1);
  });

  it('should keep the server-assigned id when an older run created the canonical with POST', async () => {
    const fhir = createFakeTerminologyHapi();
    fhir.store.set('CodeSystem/1004', { resourceType: 'CodeSystem', id: '1004', url: URL, content: 'fragment' });

    await upsertCanonical(fhir, FRAGMENT);

    expect([...fhir.store.keys()]).toEqual(['CodeSystem/1004']);
    expect(fhir.update).toHaveBeenCalledWith('CodeSystem', '1004', expect.objectContaining({ id: '1004' }));
  });

  it('should delete the legacy complete copy before the fragment is written', async () => {
    const fhir = createFakeTerminologyHapi();
    fhir.store.set('CodeSystem/1002', LEGACY_COMPLETE);

    await upsertCanonical(fhir, FRAGMENT);

    expect(fhir.delete).toHaveBeenCalledWith('CodeSystem', '1002');
    expect([...fhir.store.keys()]).toEqual(['CodeSystem/cs-nsi-services']);
  });
});
