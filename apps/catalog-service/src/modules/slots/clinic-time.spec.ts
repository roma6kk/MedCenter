import { formatSlotPeriod, slotLabel } from './clinic-time';

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

  it('should honour an explicit offset on the stored instant when the slot was written with one', () => {
    // Act
    const period = formatSlotPeriod('2026-11-02T12:00:00+03:00', '2026-11-02T12:30:00+03:00');

    // Assert
    expect(period).toBe('02.11.2026 12:00–12:30');
  });

  it('should fall back to the raw values when a bound is not a parsable instant', () => {
    // Act
    const period = formatSlotPeriod('', 'not-a-date');

    // Assert
    expect(period).toBe('–not-a-date');
  });
});

describe('slotLabel', () => {
  it('should mark a free slot as свободен when the slot is free', () => {
    // Act
    const label = slotLabel({ start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T09:30:00.000Z', status: 'free' });

    // Assert
    expect(label).toBe('02.11.2026 12:00–12:30 · свободен');
  });

  it('should mark a booked slot as занят when the slot is busy', () => {
    // Act
    const label = slotLabel({ start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T09:30:00.000Z', status: 'busy' });

    // Assert
    expect(label).toBe('02.11.2026 12:00–12:30 · занят');
  });

  it('should mark a slot retired by a schedule removal as снят when its status is entered-in-error', () => {
    // Act
    const label = slotLabel({ start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T09:30:00.000Z', status: 'entered-in-error' });

    // Assert
    expect(label).toBe('02.11.2026 12:00–12:30 · снят');
  });
});
