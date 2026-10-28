import { labelStride, niceAxis, roundedTopPath } from './chart-math';

describe('niceAxis', () => {
  it('should pick a 1, 2 or 5 step that covers the data in at most four intervals', () => {
    expect(niceAxis(3)).toEqual({ max: 3, ticks: [0, 1, 2, 3] });
    expect(niceAxis(7)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(niceAxis(23)).toEqual({ max: 30, ticks: [0, 10, 20, 30] });
    expect(niceAxis(100).max).toBe(100);
  });

  it('should still give a readable axis when nothing was counted', () => {
    expect(niceAxis(0)).toEqual({ max: 1, ticks: [0, 1] });
  });
});

describe('labelStride', () => {
  it('should label every column while they are wide enough and every nth once they crowd', () => {
    expect(labelStride(7, 700, 40)).toBe(1);
    expect(labelStride(31, 620, 40)).toBe(2);
    expect(labelStride(31, 300, 40)).toBe(5);
    expect(labelStride(1, 300, 40)).toBe(1);
  });
});

describe('roundedTopPath', () => {
  it('should round only the top corners and never more than the column allows', () => {
    expect(roundedTopPath(0, 10, 20, 30, 4)).toBe('M0,40V14Q0,10 4,10H16Q20,10 20,14V40Z');
    expect(roundedTopPath(0, 10, 20, 2, 4)).toContain('V12');
  });
});
