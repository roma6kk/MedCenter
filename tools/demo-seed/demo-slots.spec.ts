import { MEDCENTER_EXT } from '../../libs/terminology/src/lib/extension-urls';
import { buildSlot, clinicDateOf, clinicWindows, expandSlotIntervals, slotId, toMinutes, type WeeklyWindow } from './demo-slots';

describe('toMinutes', () => {
  it('should convert HH:mm to minutes', () => {
    expect(toMinutes('09:30')).toBe(570);
  });

  it('should reject a value that is not HH:mm', () => {
    expect(() => toMinutes('nine')).toThrow(/not an HH:mm time/);
  });
});

describe('clinicWindows', () => {
  it('should keep the clinic hours as given for every listed day when the window is stored', () => {
    expect(clinicWindows(['MO', 'WE'], '09:00', '13:00')).toEqual([
      { dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' },
      { dayOfWeek: 'WE', startTime: '09:00', endTime: '13:00' },
    ]);
  });

  it('should accept a window that ends at clinic midnight', () => {
    expect(clinicWindows(['MO'], '18:00', '24:00')).toEqual([{ dayOfWeek: 'MO', startTime: '18:00', endTime: '24:00' }]);
  });

  it('should reject an empty or inverted window', () => {
    expect(() => clinicWindows(['MO'], '12:00', '12:00')).toThrow(/does not fit one clinic day/);
    expect(() => clinicWindows(['MO'], '14:00', '12:00')).toThrow(/does not fit one clinic day/);
  });

  it('should reject a window that runs past clinic midnight', () => {
    expect(() => clinicWindows(['MO'], '20:00', '25:00')).toThrow(/does not fit one clinic day/);
  });
});

describe('clinicDateOf', () => {
  it('should return the Minsk calendar day when the instant is already tomorrow in UTC', () => {
    expect(clinicDateOf(new Date('2026-11-02T21:30:00.000Z'))).toBe('2026-11-03');
  });

  it('should return the same day when the instant is before 21:00Z', () => {
    expect(clinicDateOf(new Date('2026-11-02T20:59:59.999Z'))).toBe('2026-11-02');
  });
});

describe('expandSlotIntervals', () => {
  /** Clinic time: 09:00 in Minsk is 06:00Z. */
  const monday: readonly WeeklyWindow[] = [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:30' }];

  it('should cut a clinic-time window into back-to-back UTC slots of the given length', () => {
    // 2026-11-02 is a Monday.
    expect(expandSlotIntervals('2026-11-02', '2026-11-02', monday, 30)).toEqual([
      { start: '2026-11-02T06:00:00.000Z', end: '2026-11-02T06:30:00.000Z' },
      { start: '2026-11-02T06:30:00.000Z', end: '2026-11-02T07:00:00.000Z' },
      { start: '2026-11-02T07:00:00.000Z', end: '2026-11-02T07:30:00.000Z' },
    ]);
  });

  it('should emit only slots that fit entirely inside the window', () => {
    const intervals = expandSlotIntervals('2026-11-02', '2026-11-02', monday, 40);

    expect(intervals.map((interval) => interval.start)).toEqual(['2026-11-02T06:00:00.000Z', '2026-11-02T06:40:00.000Z']);
  });

  it('should apply a window only to days with its weekday over an inclusive range', () => {
    const intervals = expandSlotIntervals('2026-11-02', '2026-11-16', monday, 90);

    expect(intervals.map((interval) => interval.start.slice(0, 10))).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
  });

  it('should use the clinic weekday when a window starts just after local midnight', () => {
    // Monday 00:30 in Minsk is Sunday 21:30Z: the slot belongs to the clinic Monday.
    const night: readonly WeeklyWindow[] = [{ dayOfWeek: 'MO', startTime: '00:30', endTime: '01:00' }];

    expect(expandSlotIntervals('2026-11-02', '2026-11-02', night, 30)).toEqual([
      { start: '2026-11-01T21:30:00.000Z', end: '2026-11-01T22:00:00.000Z' },
    ]);
  });

  it('should return nothing when no window matches a day of the range', () => {
    expect(expandSlotIntervals('2026-11-03', '2026-11-08', monday, 30)).toEqual([]);
  });

  it('should return nothing when the duration is not positive', () => {
    expect(expandSlotIntervals('2026-11-02', '2026-11-02', monday, 0)).toEqual([]);
  });

  it('should reject a range bound that is not a date', () => {
    expect(() => expandSlotIntervals('someday', '2026-11-02', monday, 30)).toThrow(/is not a date/);
  });
});

describe('slotId', () => {
  it('should be the SHA-256 of "<scheduleId>|<start>" cut to 64 hex characters, like catalog-service', () => {
    expect(slotId('sched-1', '2026-11-02T06:00:00.000Z')).toBe(
      'dd7b0312bff9d49f65756cd1f9bc30ed5f6ec9b8849b14df73b6d7b75bd6b387',
    );
  });

  it('should differ when the schedule or the start differs', () => {
    const base = slotId('sched-1', '2026-11-02T06:00:00.000Z');

    expect(slotId('sched-2', '2026-11-02T06:00:00.000Z')).not.toBe(base);
    expect(slotId('sched-1', '2026-11-02T06:30:00.000Z')).not.toBe(base);
  });
});

describe('buildSlot', () => {
  const interval = { start: '2026-11-02T06:00:00.000Z', end: '2026-11-02T06:30:00.000Z' };
  const actors = [{ reference: 'PractitionerRole/r' }, { reference: 'Location/l' }];

  it('should write a free slot with the schedule reference and the actors extension', () => {
    expect(buildSlot('s1', interval, actors)).toEqual({
      resourceType: 'Slot',
      id: slotId('s1', interval.start),
      schedule: { reference: 'Schedule/s1' },
      status: 'free',
      start: interval.start,
      end: interval.end,
      extension: [{ url: MEDCENTER_EXT.SLOT_ACTORS, valueString: JSON.stringify(actors) }],
    });
  });

  it('should leave the extension out when the schedule has no actors', () => {
    expect(buildSlot('s1', interval, [])).not.toHaveProperty('extension');
  });
});
