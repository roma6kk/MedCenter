import { buildCodeSystems, buildValueSets, buildExpansionChecks } from './snapshot-resources';
import { SnapshotVerificationError, findRejectedCodes, verifySnapshot, type VerifyOptions } from './snapshot-verifier';
import { createFakeTerminologyHapi, type FakeTerminologyHapi } from './__tests__/fake-terminology-hapi';

const OPTIONS: VerifyOptions = { attempts: 3, delayMs: 5, sleep: jest.fn().mockResolvedValue(undefined) };

function seeded(): FakeTerminologyHapi {
  const fhir = createFakeTerminologyHapi();
  for (const resource of [...buildCodeSystems(), ...buildValueSets()]) {
    fhir.store.set(`${resource.resourceType}/${resource.id}`, resource);
  }
  return fhir;
}

describe('verifySnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should report every ValueSet complete when HAPI serves the whole snapshot', async () => {
    const reports = await verifySnapshot(seeded(), OPTIONS);

    expect(reports).toHaveLength(buildExpansionChecks().length);
    expect(reports.every((report) => report.missingCodes.length === 0 && report.rejectedCodes.length === 0)).toBe(true);
  });

  it('should validate every snapshot code against its own ValueSet when verifying', async () => {
    const fhir = seeded();
    const concepts = buildExpansionChecks().reduce((sum, check) => sum + check.concepts.length, 0);

    await verifySnapshot(fhir, OPTIONS);

    const validations = fhir.operation.mock.calls.filter(([, operation]) => operation === '$validate-code');
    expect(validations).toHaveLength(concepts);
  });

  it('should recreate the ValueSet and succeed when HAPI serves a stale pre-expansion once', async () => {
    const fhir = seeded();
    fhir.staleExpansions = 1;

    await verifySnapshot(fhir, OPTIONS);

    expect(fhir.delete).toHaveBeenCalledWith('ValueSet', 'vs-nsi-services');
    expect(OPTIONS.sleep).not.toHaveBeenCalled();
  });

  it('should wait between attempts and give up with a verification error when the expansion stays incomplete', async () => {
    const fhir = seeded();
    fhir.staleExpansions = 100;

    await expect(verifySnapshot(fhir, OPTIONS)).rejects.toThrow(SnapshotVerificationError);
    expect(OPTIONS.sleep).toHaveBeenCalledWith(5);
  });

  it('should name the refused codes when $validate-code rejects a snapshot code HAPI expands', async () => {
    const fhir = seeded();
    const served = fhir.operation.getMockImplementation();
    fhir.operation.mockImplementation(async (type, operation, params) =>
      operation === '$validate-code' && params?.['code'] === 'A02BC01'
        ? { resourceType: 'Parameters', parameter: [{ name: 'result', valueBoolean: false }] }
        : (served as NonNullable<typeof served>)(type, operation, params),
    );

    await expect(verifySnapshot(fhir, OPTIONS)).rejects.toThrow('rejects A02BC01');
  });
});

describe('findRejectedCodes', () => {
  it('should list the codes $validate-code refuses when the ValueSet lacks them', async () => {
    const fhir = seeded();
    const check = buildExpansionChecks().find((candidate) => candidate.valueSetUrl.endsWith('/atc'));
    if (check === undefined) {
      throw new Error('the ATC check is part of the snapshot');
    }

    const rejected = await findRejectedCodes(fhir, { ...check, concepts: [...check.concepts, { code: 'Z99ZZ99', display: 'x' }] });

    expect(rejected).toEqual(['Z99ZZ99']);
  });
});
