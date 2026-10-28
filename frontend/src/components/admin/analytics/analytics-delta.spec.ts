import { deltaOf, deltaTone } from './analytics-delta';

describe('deltaOf', () => {
  it('should give the signed change and its percentage of the previous period', () => {
    expect(deltaOf(15, 10)).toEqual({ direction: 'up', change: 5, percent: 50 });
    expect(deltaOf(3, 4)).toEqual({ direction: 'down', change: -1, percent: 25 });
    expect(deltaOf(4, 4)).toEqual({ direction: 'flat', change: 0, percent: 0 });
  });

  it('should give no percentage when there was nothing in the previous period', () => {
    expect(deltaOf(5, 0)).toEqual({ direction: 'up', change: 5, percent: null });
    expect(deltaOf(0, 0).direction).toBe('flat');
  });
});

describe('deltaTone', () => {
  it('should call more attended visits good and more cancellations or no-shows bad', () => {
    expect(deltaTone('fulfilled', 'up')).toBe('good');
    expect(deltaTone('fulfilled', 'down')).toBe('bad');
    expect(deltaTone('cancelled', 'up')).toBe('bad');
    expect(deltaTone('noshow', 'down')).toBe('good');
  });

  it('should not judge the totals, the future bookings or no change', () => {
    expect(deltaTone('total', 'up')).toBe('neutral');
    expect(deltaTone('booked', 'down')).toBe('neutral');
    expect(deltaTone('cancelled', 'flat')).toBe('neutral');
  });
});
