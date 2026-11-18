export const CONSENT_CODE_SYSTEMS = {
  SCOPE: 'http://terminology.hl7.org/CodeSystem/consentscope',
  LOINC: 'http://loinc.org',
  CATEGORY: 'urn:medcenter:consent-category',
  FORM_NUMBER: 'urn:medcenter:consent-form-number',
} as const;

export const CONSENT_CODES = {
  SCOPE_PATIENT_PRIVACY: 'patient-privacy',
  CATEGORY_EMR_PROCESSING: 'emr-processing',
  LOINC_CONSENT_DOCUMENT: '59284-0',
} as const;

export const CONSENT_POLICY_RULE_TEXT =
  'Закон «О здравоохранении», ст. 44 ч. 13; постановление Минздрава № 74 (2021)';
