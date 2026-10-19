import type { FieldErrors } from 'react-hook-form';
import type { CompleteEncounterForm } from '@/lib/contracts';
import { firstErrorPath, firstPathOnScreen } from './encounter-error-focus';

function errorsOf(tree: unknown): FieldErrors<CompleteEncounterForm> {
  return tree as FieldErrors<CompleteEncounterForm>;
}

describe('firstErrorPath', () => {
  it('should return null when the form has no errors', () => {
    expect(firstErrorPath(errorsOf({}))).toBeNull();
  });

  it('should return the summary when it and a later section are invalid', () => {
    const errors = errorsOf({ recommendations: { message: 'x' }, summary: { message: 'y' } });

    expect(firstErrorPath(errors)).toBe('summary');
  });

  it('should return the on-screen order when recommendations and observations are invalid', () => {
    const errors = errorsOf({ recommendations: { message: 'x' }, observations: [{ value: { message: 'y' } }] });

    expect(firstErrorPath(errors)).toBe('observations.0.value');
  });

  it('should point at the first diagnosis code when the whole list is invalid', () => {
    expect(firstErrorPath(errorsOf({ diagnoses: { message: 'at least one' } }))).toBe('diagnoses.0.code');
  });

  it('should find the nested leaf of a later row when earlier rows are valid', () => {
    const errors = errorsOf({ diagnoses: [undefined, { code: { message: 'bad' } }] });

    expect(firstErrorPath(errors)).toBe('diagnoses.1.code');
  });

  it('should ignore the ref of a leaf when it walks the tree', () => {
    const errors = errorsOf({ summary: { message: 'y', ref: { message: 'not-a-leaf' } } });

    expect(firstErrorPath(errors)).toBe('summary');
  });
});

describe('firstPathOnScreen', () => {
  it('should return null when there are no paths', () => {
    expect(firstPathOnScreen([])).toBeNull();
  });

  it('should return the summary when it comes with a later field', () => {
    expect(firstPathOnScreen(['recommendations', 'summary'])).toBe('summary');
  });

  it('should order the sections the way they appear on screen when drugs and observations are named', () => {
    expect(firstPathOnScreen(['medicationRequests.0.atcCode', 'observations.0.value'])).toBe('observations.0.value');
  });

  it('should return the earlier row when two rows of one list are named', () => {
    expect(firstPathOnScreen(['diagnoses.2.code', 'diagnoses.1.display'])).toBe('diagnoses.1.display');
  });

  it('should return the code before the name within one row', () => {
    expect(firstPathOnScreen(['diagnoses.0.display', 'diagnoses.0.code'])).toBe('diagnoses.0.code');
  });

  it('should point at the first diagnosis code when the whole list is named', () => {
    expect(firstPathOnScreen(['diagnoses'])).toBe('diagnoses.0.code');
  });
});
