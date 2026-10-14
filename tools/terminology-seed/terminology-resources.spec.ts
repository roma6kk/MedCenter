import atcSnapshot from './snapshot/atc.json';
import icd10Snapshot from './snapshot/icd-10.json';
import ucumSnapshot from './snapshot/ucum.json';
import {
  buildCodeSystems,
  buildExpansionChecks,
  buildValueSets,
  TERMINOLOGY_URLS,
} from './terminology-resources';

describe('buildCodeSystems', () => {
  it('should preserve the fhir.by canonical URL of the НСИ services system', () => {
    expect(buildCodeSystems()).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: 'https://fhir.by/CodeSystem/nsi-services' })]),
    );
  });

  it('should include the ICD-10 canonical required by the API contract', () => {
    expect(buildCodeSystems().some((system) => system.url.includes('InternClassificDiseases10'))).toBe(true);
  });

  it('should keep the HL7-registered canonical for ATC', () => {
    expect(buildCodeSystems().map((system) => system.url)).toContain('http://www.whocc.no/atc');
  });

  it('should not re-publish UCUM as a CodeSystem', () => {
    expect(buildCodeSystems().map((system) => system.url)).not.toContain(TERMINOLOGY_URLS.UCUM_SYSTEM);
  });

  it('should mark every system as a fragment because the snapshot is a curated subset', () => {
    expect(buildCodeSystems().every((system) => system.content === 'fragment')).toBe(true);
  });

  it('should assign a unique deterministic id and canonical URL to each system', () => {
    const systems = buildCodeSystems();

    expect(new Set(systems.map((system) => system.id)).size).toBe(systems.length);
    expect(new Set(systems.map((system) => system.url)).size).toBe(systems.length);
    expect(buildCodeSystems().map((system) => system.id)).toEqual(systems.map((system) => system.id));
  });

  it('should carry the snapshot concepts, including J06.9 and J01FA10', () => {
    const codes = new Map(buildCodeSystems().map((system) => [system.url, system.concept.map((c) => c.code)]));

    expect(codes.get(TERMINOLOGY_URLS.ICD10_CODE_SYSTEM)).toEqual(
      expect.arrayContaining(['J06.9', ...icd10Snapshot.map((c) => c.code)]),
    );
    expect(codes.get(TERMINOLOGY_URLS.ATC_CODE_SYSTEM)).toEqual(
      expect.arrayContaining(['J01FA10', ...atcSnapshot.map((c) => c.code)]),
    );
  });
});

describe('buildValueSets', () => {
  it('should bind the ICD-10 ValueSet to its CodeSystem by canonical URL (ADR-017)', () => {
    const icd10 = buildValueSets().find((valueSet) => valueSet.url.includes('InternClassificDiseases10'));

    expect(icd10?.compose.include[0]?.system).toBe('https://fhir.by/CodeSystem/InternClassificDiseases10');
  });

  it('should publish a ValueSet for ICD-10, ATC, UCUM units and both НСИ systems', () => {
    expect(buildValueSets().map((valueSet) => valueSet.url).sort()).toEqual(
      [
        TERMINOLOGY_URLS.ICD10_VALUE_SET,
        TERMINOLOGY_URLS.ATC_VALUE_SET,
        TERMINOLOGY_URLS.UCUM_VALUE_SET,
        TERMINOLOGY_URLS.SERVICE_VALUE_SET,
        TERMINOLOGY_URLS.OBSERVATION_VALUE_SET,
      ].sort(),
    );
  });

  it('should list the UCUM units explicitly because UCUM has no CodeSystem resource on the server', () => {
    const ucum = buildValueSets().find((valueSet) => valueSet.url === TERMINOLOGY_URLS.UCUM_VALUE_SET);
    const include = ucum?.compose.include[0];

    expect(include?.system).toBe(TERMINOLOGY_URLS.UCUM_SYSTEM);
    expect(include?.concept?.map((concept) => concept.code)).toEqual(
      expect.arrayContaining(['Cel', ...ucumSnapshot.map((c) => c.code)]),
    );
  });

  it('should include every system of a code-system-backed ValueSet in the seeded CodeSystems', () => {
    const systemUrls = new Set(buildCodeSystems().map((system) => system.url));
    const backed = buildValueSets().flatMap((valueSet) => valueSet.compose.include).filter((include) => include.concept === undefined);

    expect(backed.every((include) => systemUrls.has(include.system))).toBe(true);
  });

  it('should assign a unique id and canonical URL to each ValueSet', () => {
    const valueSets = buildValueSets();

    expect(new Set(valueSets.map((valueSet) => valueSet.id)).size).toBe(valueSets.length);
    expect(new Set(valueSets.map((valueSet) => valueSet.url)).size).toBe(valueSets.length);
  });
});

describe('buildExpansionChecks', () => {
  it('should expect every snapshot code from the matching ValueSet', () => {
    const checks = new Map(buildExpansionChecks().map((check) => [check.valueSetUrl, check.expectedCodes]));

    expect(checks.get(TERMINOLOGY_URLS.ICD10_VALUE_SET)).toContain('J06.9');
    expect(checks.get(TERMINOLOGY_URLS.ATC_VALUE_SET)).toContain('J01FA10');
    expect(checks.get(TERMINOLOGY_URLS.UCUM_VALUE_SET)).toContain('Cel');
  });

  it('should cover exactly the published ValueSets', () => {
    expect(buildExpansionChecks().map((check) => check.valueSetUrl).sort()).toEqual(
      buildValueSets().map((valueSet) => valueSet.url).sort(),
    );
  });
});

describe('terminology snapshot', () => {
  it.each([
    ['icd-10', icd10Snapshot],
    ['atc', atcSnapshot],
    ['ucum', ucumSnapshot],
  ])('should hold no duplicate codes in %s', (_name, snapshot) => {
    const codes = snapshot.map((concept) => concept.code);

    expect(new Set(codes).size).toBe(codes.length);
  });
});
