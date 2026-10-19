import { completeEncounterSchema, ICD10_PATTERN, ATC_PATTERN } from './contracts';

describe('completeEncounterSchema boundary pipeline', () => {
  it('should accept a valid encounter payload', () => {
    const result = completeEncounterSchema.safeParse({
      summary: 'ОРВИ, состояние удовлетворительное',
      diagnoses: [{ code: 'J06.9', display: 'Острая инфекция верхних дыхательных путей' }],
      recommendations: 'Назначить лекарство',
    });
    expect(result.success).toBe(true);
  });

  it('should reject an empty diagnoses array', () => {
    expect(completeEncounterSchema.safeParse({ summary: 'x', diagnoses: [] }).success).toBe(false);
  });

  it('should reject a missing summary', () => {
    const result = completeEncounterSchema.safeParse({
      summary: '',
      diagnoses: [{ code: 'J06.9', display: 'd' }],
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ['J06.9', true],
    ['J06', true],
    ['A00.0', true],
    ['Z99', true],
    ['j06.9', false],
    ['J6.9', false],
    ['JJ06.9', false],
    ['J06.99999', false],
    ['J06.999', false],
    ['J06.9A', false],
    ['J06.A', false],
    ['bad', false],
    ['J06,9', false],
    [' J06.9', false],
  ])('ICD-10 %s should validate as %s', (code, valid) => {
    expect(ICD10_PATTERN.test(code)).toBe(valid);
    const payload = {
      summary: 'Синдром',
      diagnoses: [{ code, display: 'd' }],
      recommendations: 'Назначить лекарство',
    };
    const result = completeEncounterSchema.safeParse(payload);
    expect(result.success).toBe(valid);
  });

  it.each([
    ['N02BE01', true],
    ['J01FA', true],
    ['J01FA10', true],
    ['J01C', false],
    ['J01F', false],
    ['J01F10', false],
    ['J01FA1', false],
    ['J01FA10X', false],
    ['n02be01', false],
    ['N02', false],
    ['N02BE0', false],
    ['N02BE012X', false],
  ])('ATC %s should validate as %s', (atcCode, valid) => {
    expect(ATC_PATTERN.test(atcCode)).toBe(valid);
    const result = completeEncounterSchema.safeParse({
      summary: 'Синдром',
      diagnoses: [{ code: 'J06.9', display: 'd' }],
      recommendations: 'Назначить лекарство',
      medicationRequests: [{ atcCode, dosageText: '500 mg', ucumUnit: 'mg' }],
    });
    expect(result.success).toBe(valid);
  });

  it('should reject a medication request with an empty UCUM unit', () => {
    const result = completeEncounterSchema.safeParse({
      summary: 's',
      diagnoses: [{ code: 'J06.9', display: 'd' }],
      medicationRequests: [{ atcCode: 'N02BE01', dosageText: '500 mg', ucumUnit: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject a medication request with an empty dosage text', () => {
    const result = completeEncounterSchema.safeParse({
      summary: 's',
      diagnoses: [{ code: 'J06.9', display: 'd' }],
      medicationRequests: [{ atcCode: 'N02BE01', dosageText: '', ucumUnit: 'mg' }],
    });
    expect(result.success).toBe(false);
  });
});
