/**
 * Codes of the patient `Consent` (ADR-019). The clinic-local systems live in
 * the `urn:medcenter:` namespace: there is no national code for them, and a
 * made-up `fhir.by` system would fail the ADR-017 contract test.
 */
export const CONSENT_CODE_SYSTEMS = {
  /** HL7 R4 `Consent.scope` — `patient-privacy`. */
  SCOPE: 'http://terminology.hl7.org/CodeSystem/consentscope',
  /** General «Consent Document» category; the clinic category below is the one searched. */
  LOINC: 'http://loinc.org',
  /** Clinic-local `Consent.category`. */
  CATEGORY: 'urn:medcenter:consent-category',
  /** `Consent.identifier.system` — the number of the paper form. */
  FORM_NUMBER: 'urn:medcenter:consent-form-number',
} as const;

export const CONSENT_CODES = {
  SCOPE_PATIENT_PRIVACY: 'patient-privacy',
  /** Consent to enter the patient's data into the electronic medical record (ст. 44 ч. 13). */
  CATEGORY_EMR_PROCESSING: 'emr-processing',
  LOINC_CONSENT_DOCUMENT: '59284-0',
} as const;

/** `Consent.policyRule.text`: the norm in words, no code (it ages quickly). */
export const CONSENT_POLICY_RULE_TEXT =
  'Закон «О здравоохранении», ст. 44 ч. 13; постановление Минздрава № 74 (2021)';
