import { emptyScheduleValues, scheduleSchemaFor, scheduleValuesOf, toCreateSchedulePayload, toUpdateSchedulePayload, type ScheduleFormValues } from './schedule-schema';
import type { AdminSchedule } from './schedule-types';

const ids = { practitionerRoleId: '6ef5270b-6282-5a43-87f9-26d2d8b0c4f7', roomId: 'e2d03532-6e47-54e0-a534-7089c0960bf7', serviceId: '2cfc8958-1be9-587e-a420-0b0933d197c3' };

function values(overrides: Partial<ScheduleFormValues> = {}): ScheduleFormValues {
  return { ...emptyScheduleValues(new Date('2026-10-16T09:00:00Z')), ...ids, ...overrides };
}

function failing(mode: 'create' | 'edit', form: ScheduleFormValues): ReadonlyArray<string> {
  const result = scheduleSchemaFor(mode).safeParse(form);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('scheduleSchemaFor(create)', () => {
  it('should accept the defaults when the three actors are chosen', () => {
    expect(failing('create', values())).toEqual([]);
  });

  it('should open with today, a 30-day horizon, 30-minute slots and one Monday window when the form is empty', () => {
    expect(emptyScheduleValues(new Date('2026-10-16T09:00:00Z'))).toMatchObject({
      horizonFrom: '2026-10-16',
      horizonTo: '2026-11-15',
      slotDurationMin: '30',
      windows: [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' }],
    });
  });

  it('should require the doctor, the room and the service when none is chosen', () => {
    expect(failing('create', values({ practitionerRoleId: '', roomId: '', serviceId: '' }))).toEqual(expect.arrayContaining(['practitionerRoleId', 'roomId', 'serviceId']));
  });

  it('should refuse a horizon when it is over 90 days or ends before it starts', () => {
    expect(failing('create', values({ horizonTo: '2027-02-01' }))).toContain('horizonTo');
    expect(failing('create', values({ horizonTo: '2026-10-01' }))).toContain('horizonTo');
  });

  it('should accept a horizon when it is exactly 90 days', () => {
    expect(failing('create', values({ horizonTo: '2027-01-14' }))).toEqual([]);
  });

  it.each(['4', '121', '30.5', '', 'abc'])('should refuse the slot duration %j when the form is checked', (slotDurationMin) => {
    expect(failing('create', values({ slotDurationMin }))).toContain('slotDurationMin');
  });

  it('should require at least one window when the list is empty', () => {
    expect(failing('create', values({ windows: [] }))).toContain('windows');
  });

  it('should refuse a window when it ends before it starts', () => {
    expect(failing('create', values({ windows: [{ dayOfWeek: 'MO', startTime: '13:00', endTime: '09:00' }] }))).toContain('windows.0.endTime');
  });

  it('should refuse windows of one weekday when they overlap, and accept the same hours on another weekday', () => {
    const overlapping = [{ dayOfWeek: 'MO' as const, startTime: '09:00', endTime: '13:00' }, { dayOfWeek: 'MO' as const, startTime: '12:00', endTime: '15:00' }];
    const otherDay = [overlapping[0] ?? { dayOfWeek: 'MO' as const, startTime: '09:00', endTime: '13:00' }, { dayOfWeek: 'TU' as const, startTime: '09:00', endTime: '13:00' }];

    expect(failing('create', values({ windows: overlapping }))).toContain('windows');
    expect(failing('create', values({ windows: otherDay }))).toEqual([]);
  });
});

describe('scheduleSchemaFor(edit)', () => {
  it('should not ask for the actors again when a schedule is edited', () => {
    expect(failing('edit', values({ practitionerRoleId: '', roomId: '', serviceId: '' }))).toEqual([]);
  });
});

describe('toCreateSchedulePayload', () => {
  it('should build CreateScheduleDto with sorted windows, a numeric duration and no empty comment when the form is valid', () => {
    const payload = toCreateSchedulePayload(
      values({ comment: '  ', windows: [{ dayOfWeek: 'WE', startTime: '14:00', endTime: '16:00' }, { dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' }] }),
    );

    expect(payload).toEqual({
      ...ids,
      horizonFrom: '2026-10-16',
      horizonTo: '2026-11-15',
      windows: [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' }, { dayOfWeek: 'WE', startTime: '14:00', endTime: '16:00' }],
      slotDurationMin: 30,
    });
  });

  it('should send a trimmed comment when there is one', () => {
    expect(toCreateSchedulePayload(values({ comment: ' первичный приём ' }))).toMatchObject({ comment: 'первичный приём' });
  });
});

describe('toUpdateSchedulePayload', () => {
  it('should send only what an edit can change, never the actors, when a schedule is edited', () => {
    const payload = toUpdateSchedulePayload(values({ slotDurationMin: '20' }));

    expect(Object.keys(payload).sort()).toEqual(['comment', 'horizonFrom', 'horizonTo', 'slotDurationMin', 'windows']);
    expect(payload.slotDurationMin).toBe(20);
  });

  it('should send an empty comment so that the server drops the old one when the text is cleared on edit', () => {
    expect(toUpdateSchedulePayload(values({ comment: '   ' }))).toHaveProperty('comment', '');
  });

  it('should send the trimmed comment when the text is changed on edit', () => {
    expect(toUpdateSchedulePayload(values({ comment: ' новый ' }))).toHaveProperty('comment', 'новый');
  });
});

describe('scheduleValuesOf', () => {
  it('should fill the form from a list item and survive a broken leftover schedule when the schedule has no fields', () => {
    const complete: AdminSchedule = { id: 's1', isActive: true, ...ids, horizonFrom: '2026-10-16', horizonTo: '2026-10-29', slotDurationMin: 25, windows: [{ dayOfWeek: 'FR', startTime: '10:00', endTime: '12:00' }], comment: 'c' };
    const broken: AdminSchedule = { id: 's2', isActive: false, windows: [] };

    expect(scheduleValuesOf(complete)).toMatchObject({ ...ids, slotDurationMin: '25', comment: 'c', windows: [{ dayOfWeek: 'FR', startTime: '10:00', endTime: '12:00' }] });
    expect(scheduleValuesOf(broken)).toMatchObject({ practitionerRoleId: '', roomId: '', serviceId: '', windows: [{ dayOfWeek: 'MO' }] });
  });
});
