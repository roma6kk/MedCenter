import { BadRequestException } from '@nestjs/common';

import {
  DEFAULT_SLOT_RANGE_DAYS,
  MAX_SLOT_LOOKAHEAD_DAYS,
  MAX_SLOT_RANGE_DAYS,
  resolveSlotRange,
} from './slot-range';

const NOW = Date.parse('2026-11-02T10:15:00.000Z');

function errorCodeOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error: unknown) {
    if (error instanceof BadRequestException) {
      return (error.getResponse() as { errorCode?: unknown }).errorCode;
    }
    throw error;
  }
  return undefined;
}

describe('resolveSlotRange', () => {
  it('should default to two weeks starting today when neither bound is given', () => {
    const range = resolveSlotRange({}, NOW);

    expect(DEFAULT_SLOT_RANGE_DAYS).toBe(14);
    expect(range).toMatchObject({ from: '2026-11-02', to: '2026-11-16' });
  });

  it('should start the default window on the clinic day when it is already tomorrow in UTC terms', () => {
    const lateEvening = Date.parse('2026-11-02T22:30:00.000Z');

    const range = resolveSlotRange({}, lateEvening);

    expect(range.from).toBe('2026-11-03');
  });

  it('should derive the upper bound in date form when only a date `from` is given', () => {
    const range = resolveSlotRange({ from: '2026-11-10' }, NOW);

    expect(range).toMatchObject({ from: '2026-11-10', to: '2026-11-24' });
  });

  it('should derive the upper bound in date-time form when only a date-time `from` is given', () => {
    const range = resolveSlotRange({ from: '2026-11-10T09:00:00.000Z' }, NOW);

    expect(range).toMatchObject({ from: '2026-11-10T09:00:00.000Z', to: '2026-11-24T09:00:00.000Z' });
  });

  it('should read date-only bounds as whole clinic days when the instants are resolved', () => {
    const range = resolveSlotRange({ from: '2026-11-03', to: '2026-11-04' }, NOW);

    expect(new Date(range.fromMs).toISOString()).toBe('2026-11-02T21:00:00.000Z');
    expect(new Date(range.toMs).toISOString()).toBe('2026-11-04T20:59:59.999Z');
  });

  it('should keep the exact instants when the bounds are date-times with offsets', () => {
    const range = resolveSlotRange({ from: '2026-11-03T09:00:00+03:00', to: '2026-11-03T12:00:00Z' }, NOW);

    expect(new Date(range.fromMs).toISOString()).toBe('2026-11-03T06:00:00.000Z');
    expect(new Date(range.toMs).toISOString()).toBe('2026-11-03T12:00:00.000Z');
  });

  it('should accept a range of exactly the maximum span', () => {
    const range = resolveSlotRange({ from: '2026-11-01', to: '2026-12-02' }, NOW);

    expect(MAX_SLOT_RANGE_DAYS).toBe(31);
    expect(range.to).toBe('2026-12-02');
  });

  it.each([
    ['the range is longer than the maximum span', { from: '2026-11-01', to: '2026-12-03' }],
    ['`to` is before `from`', { from: '2026-11-05', to: '2026-11-04' }],
    ['only a `to` in the past is given', { to: '2026-10-01' }],
    ['`from` is beyond the lookahead limit', { from: '2027-11-04', to: '2027-11-05' }],
  ])('should reject with VALIDATION_ERROR when %s', (_label, bounds) => {
    expect(errorCodeOf(() => resolveSlotRange(bounds, NOW))).toBe('VALIDATION_ERROR');
  });

  it('should accept a `from` exactly at the lookahead limit when it is a clinic date', () => {
    const limit = '2027-11-03';

    const range = resolveSlotRange({ from: limit, to: limit }, NOW);

    expect(MAX_SLOT_LOOKAHEAD_DAYS).toBe(366);
    expect(range.from).toBe(limit);
  });

  it('should accept a window that lies entirely in the past when both bounds are valid', () => {
    const range = resolveSlotRange({ from: '2020-01-01', to: '2020-01-10' }, NOW);

    expect(range.from).toBe('2020-01-01');
  });
});
