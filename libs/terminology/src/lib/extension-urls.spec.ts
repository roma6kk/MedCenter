import { MEDCENTER_EXT } from './extension-urls';

describe('MEDCENTER_EXT', () => {
  const urls = Object.values(MEDCENTER_EXT);

  it.each(urls)('%s should be an absolute URL (FHIR R4 Extension.url)', (url) => {
    expect(new URL(url).protocol).toBe('https:');
  });

  it('should give every extension its own URL', () => {
    // One URL per meaning and value type — no two extensions may share it.
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('MEDCENTER_EXT consent extensions', () => {
  it('should declare the three Consent extensions under the MedCenter StructureDefinition base', () => {
    expect(MEDCENTER_EXT.CONSENT_CONSENTER_TYPE).toBe('https://api.medcenter.by/fhir/StructureDefinition/consent-consenter-type');
    expect(MEDCENTER_EXT.CONSENT_REPRESENTATIVE_DOCUMENT).toContain('/consent-representative-document');
    expect(MEDCENTER_EXT.CONSENT_REVOCATION_NUMBER).toContain('/consent-revocation-number');
  });
});
