import { groupByClinicDay, matchesFilter, notificationAction, notificationKind } from './notification-logic';

describe('groupByClinicDay', () => {
  it('should group by the Minsk calendar day, not the UTC one', () => {
    const items = [
      { id: 'a', sent: '2026-10-19T21:30:00Z' },
      { id: 'b', sent: '2026-10-19T20:30:00Z' },
      { id: 'c', sent: '2026-10-17T09:00:00Z' },
    ];

    const days = groupByClinicDay(items);

    expect(days.map((day) => [day.dayKey, day.items.map((i) => i.id)])).toEqual([
      ['2026-10-20', ['a']],
      ['2026-10-19', ['b']],
      ['2026-10-17', ['c']],
    ]);
  });

  it('should keep the incoming order inside a day and return nothing for nothing', () => {
    const days = groupByClinicDay([{ sent: '2026-10-19T08:06:00Z', n: 1 }, { sent: '2026-10-19T08:03:00Z', n: 2 }]);

    expect(days).toHaveLength(1);
    expect(days[0]?.items.map((i) => i.n)).toEqual([1, 2]);
    expect(groupByClinicDay([])).toEqual([]);
  });
});

describe('notificationKind', () => {
  it('should give every known type its own label and fall back to a neutral one', () => {
    expect(notificationKind('appointment').labelKey).toBe('categoryAppointment');
    expect(notificationKind('encounter').labelKey).toBe('categoryEncounter');
    expect(notificationKind('registration').labelKey).toBe('categoryRegistration');
    expect(notificationKind('anything').labelKey).toBe('categoryOther');
    expect(notificationKind('appointment').icon).not.toBe(notificationKind('encounter').icon);
  });
});

describe('notificationAction', () => {
  it('should lead a booking notification to its appointment only when the payload has the id', () => {
    expect(notificationAction({ category: 'appointment', appointmentId: 'ap 1' })).toEqual({ labelKey: 'openAppointment', href: '/appointments/ap%201' });
    expect(notificationAction({ category: 'appointment' })).toBeNull();
    expect(notificationAction({ category: 'appointment', appointmentId: '  ' })).toBeNull();
  });

  it('should lead a finished visit to the history and offer nothing for other types', () => {
    expect(notificationAction({ category: 'encounter' })).toEqual({ labelKey: 'openHistory', href: '/history' });
    expect(notificationAction({ category: 'registration' })).toBeNull();
    expect(notificationAction({ category: 'other' })).toBeNull();
  });
});

describe('matchesFilter', () => {
  const unreadBooking = { category: 'appointment', read: false };
  const readVisit = { category: 'encounter', read: true };

  it('should let everything through for "all" and select by read state for "unread"', () => {
    expect([unreadBooking, readVisit].filter((i) => matchesFilter(i, 'all'))).toHaveLength(2);
    expect([unreadBooking, readVisit].filter((i) => matchesFilter(i, 'unread'))).toEqual([unreadBooking]);
  });

  it('should select by type for the type filters', () => {
    expect(matchesFilter(unreadBooking, 'appointment')).toBe(true);
    expect(matchesFilter(unreadBooking, 'encounter')).toBe(false);
    expect(matchesFilter(readVisit, 'encounter')).toBe(true);
  });
});
