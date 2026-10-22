import { isCancellable } from './appointment-types';

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
