import atcSnapshot from './snapshot/atc.json';
import icd10Snapshot from './snapshot/icd-10.json';

/**
 * The snapshot is medical reference data: a wrong display silently misidentifies
 * a drug or a diagnosis, because `$validate-code` only checks that the code
 * exists. These tests pin the structure and the pairs a review has already
 * corrected, so they cannot regress.
 */

interface Concept {
  readonly code: string;
  readonly display: string;
}

const ATC_CODE_PATTERN = /^[A-Z]\d{2}[A-Z]{2}\d{2}$/;
const ICD10_CODE_PATTERN = /^[A-Z]\d{2}(\.\d{1,2})?$/;

function displayOf(snapshot: readonly Concept[], code: string): string | undefined {
  return snapshot.find((concept) => concept.code === code)?.display;
}

describe('ATC snapshot', () => {
  it('should use only 7-character ATC codes when the snapshot is read', () => {
    expect(atcSnapshot.every((concept) => ATC_CODE_PATTERN.test(concept.code))).toBe(true);
  });

  it('should list every code once when the snapshot is read', () => {
    expect(new Set(atcSnapshot.map((concept) => concept.code)).size).toBe(atcSnapshot.length);
  });

  it('should name C09AA03 lisinopril when the snapshot is read', () => {
    expect(displayOf(atcSnapshot, 'C09AA03')).toBe('Лизиноприл');
  });

  it('should not label C09AA05 (ramipril) as lisinopril when the snapshot is read', () => {
    expect(displayOf(atcSnapshot, 'C09AA05') ?? 'Рамиприл').toBe('Рамиприл');
  });

  it('should keep the ATC code of azithromycin that the encounter flow validates when the snapshot is read', () => {
    expect(displayOf(atcSnapshot, 'J01FA10')).toBe('Азитромицин');
  });
});

describe('ICD-10 snapshot', () => {
  it('should use only ICD-10 category or subcategory codes when the snapshot is read', () => {
    expect(icd10Snapshot.every((concept) => ICD10_CODE_PATTERN.test(concept.code))).toBe(true);
  });

  it('should list every code once when the snapshot is read', () => {
    expect(new Set(icd10Snapshot.map((concept) => concept.code)).size).toBe(icd10Snapshot.length);
  });
});
