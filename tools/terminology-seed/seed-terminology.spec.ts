import { buildCodeSystems, buildValueSets } from './seed-terminology';

describe('buildCodeSystems', () => {
  it('should produce R4 CodeSystems preserving the fhir.by canonical URL', () => {
    expect(buildCodeSystems()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://fhir.by/CodeSystem/nsi-services' }),
      ]),
    );
  });

  it('should include the ICD-10 canonical required by the API contract', () => {
    expect(buildCodeSystems().some((s) => s.url.includes('InternClassificDiseases10'))).toBe(true);
  });
});

describe('buildValueSets', () => {
  it('should bind the ICD-10 ValueSet to its CodeSystem by canonical URL (ADR-017)', () => {
    const icd10 = buildValueSets().find((vs) =>
      vs.url.includes('InternClassificDiseases10'),
    );

    expect(icd10).toBeDefined();
    expect(icd10?.compose.include[0]?.system).toBe(
      'https://fhir.by/CodeSystem/InternClassificDiseases10',
    );
  });
});
