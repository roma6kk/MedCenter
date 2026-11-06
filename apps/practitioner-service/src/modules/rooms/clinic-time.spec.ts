import { formatHorizonDate } from './clinic-time';

describe('formatHorizonDate', () => {
  it('should turn a FHIR date into DD.MM.YYYY when the value is a calendar date', () => {
    const text = formatHorizonDate('2026-11-30');

    expect(text).toBe('30.11.2026');
  });

  it('should keep only the calendar date when the value is a date-time', () => {
    const text = formatHorizonDate('2026-11-30T00:00:00Z');

    expect(text).toBe('30.11.2026');
  });

  it('should return undefined when the value is not a FHIR date', () => {
    const text = formatHorizonDate(42);

    expect(text).toBeUndefined();
  });
});
