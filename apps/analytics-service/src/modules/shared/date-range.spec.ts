import { BadRequestException } from '@nestjs/common';

import { MAX_RANGE_DAYS, resolveDateRange } from './date-range';

const NOW = new Date('2026-10-13T08:30:00.000Z');

function errorCodeOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error instanceof BadRequestException ? (error.getResponse() as { errorCode?: unknown }).errorCode : error;
  }
  return undefined;
}

describe('resolveDateRange', () => {
  it('should treat a date-only "to" as inclusive by ending the range at the next UTC midnight when both bounds are dates', () => {
    const range = resolveDateRange({ from: '2026-01-01', to: '2026-12-31' }, NOW);

    expect(range.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('should keep an explicit datetime "to" inclusive by adding one millisecond when "to" carries a time', () => {
    const range = resolveDateRange({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T12:00:00Z' }, NOW);

    expect(range.toExclusive.toISOString()).toBe('2026-10-02T12:00:00.001Z');
  });

  it('should default to the last 30 days ending today when no bounds are given', () => {
    const range = resolveDateRange({}, NOW);

    expect(range.toExclusive.toISOString()).toBe('2026-10-14T00:00:00.000Z');
    expect(range.from.toISOString()).toBe('2026-09-14T00:00:00.000Z');
  });

  it('should accept a full leap year when the span is exactly 366 days', () => {
    const range = resolveDateRange({ from: '2024-01-01', to: '2024-12-31' }, NOW);

    expect((range.toExclusive.getTime() - range.from.getTime()) / 86_400_000).toBe(MAX_RANGE_DAYS);
  });

  it('should reject a range longer than 366 days with VALIDATION_ERROR when the span is too wide', () => {
    expect(() => resolveDateRange({ from: '2024-01-01', to: '2025-01-01' }, NOW)).toThrow('range');
    expect(errorCodeOf(() => resolveDateRange({ from: '2024-01-01', to: '2025-01-01' }, NOW))).toBe('VALIDATION_ERROR');
  });

  it('should reject a range whose "from" is after "to" with VALIDATION_ERROR when the bounds are swapped', () => {
    expect(() => resolveDateRange({ from: '2026-02-01', to: '2026-01-31' }, NOW)).toThrow('range');
    expect(errorCodeOf(() => resolveDateRange({ from: '2026-02-01', to: '2026-01-31' }, NOW))).toBe('VALIDATION_ERROR');
  });

  it('should accept a single-day range when "from" equals "to"', () => {
    const range = resolveDateRange({ from: '2026-03-08', to: '2026-03-08' }, NOW);

    expect(range.toExclusive.getTime() - range.from.getTime()).toBe(86_400_000);
  });

  it('should read a date-time as UTC when the value carries no offset', () => {
    const range = resolveDateRange({ from: '2026-10-01T10:00', to: '2026-10-01T12:00:00' }, NOW);

    expect(range.from.toISOString()).toBe('2026-10-01T10:00:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2026-10-01T12:00:00.001Z');
  });

  it('should honour an explicit offset when the date-time carries one', () => {
    const range = resolveDateRange({ from: '2026-10-01T10:00:00+03:00', to: '2026-10-01T12:00:00+03:00' }, NOW);

    expect(range.from.toISOString()).toBe('2026-10-01T07:00:00.000Z');
  });

  it('should reject an ISO value that does not denote an instant when the format is a week date', () => {
    expect(errorCodeOf(() => resolveDateRange({ from: '2026-W01', to: '2026-01-31' }, NOW))).toBe('VALIDATION_ERROR');
  });

  it.each(['2026', '2026-10', '20261001', '2026-10-01T10', '2026-10-01 10:00', '2026-10-01T10:00:00+0300'])(
    'should reject the value %s with VALIDATION_ERROR when it is not an RFC 3339 date or date-time',
    (value) => {
      expect(errorCodeOf(() => resolveDateRange({ from: value, to: '2026-10-31' }, NOW))).toBe('VALIDATION_ERROR');
      expect(errorCodeOf(() => resolveDateRange({ from: '2026-10-01', to: value }, NOW))).toBe('VALIDATION_ERROR');
    },
  );
});
