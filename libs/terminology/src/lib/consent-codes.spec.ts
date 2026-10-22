import { CONSENT_CODE_SYSTEMS, CONSENT_CODES } from './consent-codes';

describe('consent code systems', () => {
  it('should keep the clinic-local systems in the urn:medcenter namespace, never under fhir.by (ADR-017)', () => {
    expect(CONSENT_CODE_SYSTEMS.CATEGORY).toBe('urn:medcenter:consent-category');
    expect(CONSENT_CODE_SYSTEMS.FORM_NUMBER).toBe('urn:medcenter:consent-form-number');
    expect(
      Object.values(CONSENT_CODE_SYSTEMS).filter((system: string) =>
        system.startsWith('https://fhir.by/'),
      ),
    ).toEqual([]);
  });

  it('should name the EMR processing category and the R4 patient-privacy scope', () => {
    expect(CONSENT_CODES.CATEGORY_EMR_PROCESSING).toBe('emr-processing');
    expect(CONSENT_CODES.SCOPE_PATIENT_PRIVACY).toBe('patient-privacy');
    expect(CONSENT_CODE_SYSTEMS.SCOPE).toBe('http://terminology.hl7.org/CodeSystem/consentscope');
  });
});
