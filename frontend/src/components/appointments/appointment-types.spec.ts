import { appointmentFixture } from './appointment-fixtures';
import { activeFirst, isCancellable } from './appointment-types';

describe('activeFirst', () => {
  it('should put the cancelled appointments last and keep the order inside each group', () => {
    const items = [
      appointmentFixture({ id: 'c1', status: 'cancelled' }),
      appointmentFixture({ id: 'b1', status: 'booked' }),
      appointmentFixture({ id: 'c2', status: 'cancelled' }),
      appointmentFixture({ id: 'b2', status: 'booked' }),
    ];

    expect(activeFirst(items).map((item) => item.id)).toEqual(['b1', 'b2', 'c1', 'c2']);
  });

  it('should not change the given list', () => {
    const items = [appointmentFixture({ id: 'c1', status: 'cancelled' }), appointmentFixture({ id: 'b1', status: 'booked' })];

    activeFirst(items);

    expect(items.map((item) => item.id)).toEqual(['c1', 'b1']);
  });

  it('should return an empty list for an empty list', () => {
    expect(activeFirst([])).toEqual([]);
  });
});

describe('isCancellable', () => {
  it.each([
    ['booked', true],
    ['cancelled', false],
    ['noshow', false],
    ['fulfilled', false],
  ] as const)('should say a %s appointment is cancellable: %s', (status, expected) => {
    expect(isCancellable(status)).toBe(expected);
  });
});
