import { SnapshotImporter } from './snapshot-importer';
import { SNAPSHOT_VERSION, buildCodeSystems, buildValueSets } from './snapshot-resources';
import { SnapshotVerificationError, type VerifyOptions } from './snapshot-verifier';
import { createFakeTerminologyHapi } from './__tests__/fake-terminology-hapi';

const OPTIONS: VerifyOptions = { attempts: 2, delayMs: 1, sleep: jest.fn().mockResolvedValue(undefined) };
const RESOURCE_COUNT = buildCodeSystems().length + buildValueSets().length;

describe('SnapshotImporter', () => {
  it('should publish every CodeSystem and ValueSet of the snapshot when HAPI is empty', async () => {
    const fhir = createFakeTerminologyHapi();

    const summary = await new SnapshotImporter(fhir, OPTIONS).run();

    expect(summary).toMatchObject({ snapshotVersion: SNAPSHOT_VERSION, created: RESOURCE_COUNT, updated: 0 });
    expect(fhir.store.size).toBe(RESOURCE_COUNT);
  });

  it('should write the CodeSystems before the ValueSets when the snapshot is published', async () => {
    const fhir = createFakeTerminologyHapi();

    await new SnapshotImporter(fhir, OPTIONS).run();

    const order = fhir.update.mock.calls.map(([resourceType]) => resourceType);
    expect(order.lastIndexOf('CodeSystem')).toBeLessThan(order.indexOf('ValueSet'));
  });

  it('should update in place and report no creation when the import is repeated', async () => {
    const fhir = createFakeTerminologyHapi();
    const importer = new SnapshotImporter(fhir, OPTIONS);
    await importer.run();

    const second = await importer.run();

    expect(second).toMatchObject({ created: 0, updated: RESOURCE_COUNT });
    expect(fhir.store.size).toBe(RESOURCE_COUNT);
  });

  it('should list the resources it wrote as Type/id when it finishes', async () => {
    const summary = await new SnapshotImporter(createFakeTerminologyHapi(), OPTIONS).run();

    expect(summary.resources).toEqual(expect.arrayContaining(['CodeSystem/cs-icd10', 'ValueSet/vs-ucum']));
  });

  it('should prove every ValueSet expands and validates when the import finishes', async () => {
    const summary = await new SnapshotImporter(createFakeTerminologyHapi(), OPTIONS).run();

    expect(summary.expansions.every((report) => report.total > 0 && report.rejectedCodes.length === 0)).toBe(true);
  });

  it('should fail with a verification error when HAPI never serves the written snapshot', async () => {
    const fhir = createFakeTerminologyHapi();
    fhir.staleExpansions = 1000;

    await expect(new SnapshotImporter(fhir, OPTIONS).run()).rejects.toBeInstanceOf(SnapshotVerificationError);
  });

  it('should stop when HAPI refuses a write', async () => {
    const fhir = createFakeTerminologyHapi();
    fhir.update.mockRejectedValueOnce(new Error('HAPI down'));

    await expect(new SnapshotImporter(fhir, OPTIONS).run()).rejects.toThrow('HAPI down');
  });
});
