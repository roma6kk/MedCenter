import { formatHorizonDate, formatSlotPeriod } from './clinic-time';

describe('formatSlotPeriod', () => {
  it('should render a same-day period in clinic time (Europe/Minsk, UTC+3) when both bounds share a day', () => {
    // Act
    const period = formatSlotPeriod('2026-11-02T09:00:00.000Z', '2026-11-02T09:30:00.000Z');

    // Assert
    expect(period).toBe('02.11.2026 12:00–12:30');
  });

  it('should repeat the date on the end bound when the period crosses midnight in clinic time', () => {
    // Act
    const period = formatSlotPeriod('2026-11-02T20:30:00.000Z', '2026-11-02T21:30:00.000Z');

    // Assert
    expect(period).toBe('02.11.2026 23:30–03.11.2026 00:30');
  });

  it('should fall back to the raw values when a bound is not a parsable instant', () => {
    // Act
    const period = formatSlotPeriod('', 'not-a-date');

    // Assert
    expect(period).toBe('–not-a-date');
  });
});

describe('formatHorizonDate', () => {
  it('should turn a FHIR date into DD.MM.YYYY when the value is a calendar date', () => {
    // Act
    const text = formatHorizonDate('2026-11-30');

    // Assert
    expect(text).toBe('30.11.2026');
  });

  it('should keep only the calendar date when the value is a date-time', () => {
    // Act
    const text = formatHorizonDate('2026-11-30T00:00:00Z');

    // Assert
    expect(text).toBe('30.11.2026');
  });

  it('should return undefined when the value is not a FHIR date', () => {
    // Act
    const text = formatHorizonDate(42);

    // Assert
    expect(text).toBeUndefined();
  });
});
