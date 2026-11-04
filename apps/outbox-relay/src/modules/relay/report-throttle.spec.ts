import { ReportThrottle } from './report-throttle';

const HOUR = 60 * 60_000;

describe('ReportThrottle', () => {
  it('should let the first report of a key through and hold the repeats back for the interval', () => {
    const throttle = new ReportThrottle(HOUR, 10);

    expect(throttle.shouldReport('b1', 0)).toBe(true);
    expect(throttle.shouldReport('b1', 2_000)).toBe(false);
    expect(throttle.shouldReport('b1', HOUR - 1)).toBe(false);
  });

  it('should report a key again once the interval has passed, and count from that report', () => {
    const throttle = new ReportThrottle(HOUR, 10);
    throttle.shouldReport('b1', 0);

    expect(throttle.shouldReport('b1', HOUR)).toBe(true);
    expect(throttle.shouldReport('b1', HOUR + 1_000)).toBe(false);
    expect(throttle.shouldReport('b1', 2 * HOUR)).toBe(true);
  });

  it('should throttle every key on its own', () => {
    const throttle = new ReportThrottle(HOUR, 10);

    expect(throttle.shouldReport('b1', 0)).toBe(true);
    expect(throttle.shouldReport('b2', 1)).toBe(true);
    expect(throttle.shouldReport('b1', 2)).toBe(false);
    expect(throttle.shouldReport('b2', 3)).toBe(false);
  });

  it('should forget the key reported longest ago when more keys than the capacity come', () => {
    const throttle = new ReportThrottle(HOUR, 2);
    throttle.shouldReport('b1', 0);
    throttle.shouldReport('b2', 1);
    throttle.shouldReport('b3', 2);

    // b1 was dropped to make room, so it is reported as new; b3 is still held back.
    expect(throttle.shouldReport('b3', 3)).toBe(false);
    expect(throttle.shouldReport('b1', 4)).toBe(true);
  });

  it('should keep a key that is reported again among the newest when the capacity is reached', () => {
    const throttle = new ReportThrottle(10, 2);
    throttle.shouldReport('b1', 0);
    throttle.shouldReport('b2', 1);
    throttle.shouldReport('b1', 20);
    throttle.shouldReport('b3', 21);

    expect(throttle.shouldReport('b1', 22)).toBe(false);
  });

  it('should default to the current time', () => {
    const throttle = new ReportThrottle(HOUR, 10);

    expect(throttle.shouldReport('b1')).toBe(true);
    expect(throttle.shouldReport('b1')).toBe(false);
  });
});
