import { slotLabel } from './clinic-time';

describe('slotLabel', () => {
  it('should mark a free slot as свободен when the slot is free', () => {
    const label = slotLabel({ start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T09:30:00.000Z', status: 'free' });

    expect(label).toBe('02.11.2026 12:00–12:30 · свободен');
  });

  it('should mark a booked slot as занят when the slot is busy', () => {
    const label = slotLabel({ start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T09:30:00.000Z', status: 'busy' });

    expect(label).toBe('02.11.2026 12:00–12:30 · занят');
  });

  it('should mark a slot retired by a schedule removal as снят when its status is entered-in-error', () => {
    const label = slotLabel({ start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T09:30:00.000Z', status: 'entered-in-error' });

    expect(label).toBe('02.11.2026 12:00–12:30 · снят');
  });
});
