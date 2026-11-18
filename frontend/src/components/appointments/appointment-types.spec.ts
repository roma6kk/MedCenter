import { isCancellable, isCancellableByPatient } from './appointment-types';

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

describe('isCancellableByPatient', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-11-02T09:00:00+03:00') }));
  afterEach(() => jest.useRealTimers());

  it.each([
    ['booked', '2026-11-02T09:30:00+03:00', true],
    ['booked', '2026-11-02T09:00:00+03:00', false],
    ['booked', '2026-11-02T08:00:00+03:00', false],
    ['cancelled', '2026-11-02T09:30:00+03:00', false],
  ] as const)('should say a %s appointment starting at %s is cancellable by the patient: %s', (status, start, expected) => {
    expect(isCancellableByPatient({ status, start })).toBe(expected);
  });
});
