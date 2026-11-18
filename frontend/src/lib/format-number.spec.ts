import { formatNumber } from './clinic-time';

describe('formatNumber', () => {
  it('should write the decimal comma in Russian and the point in English', () => {
    expect(formatNumber(36.6, 'ru')).toBe('36,6');
    expect(formatNumber(36.6, 'en')).toBe('36.6');
  });

  it('should leave an integer alone and never group digits', () => {
    expect(formatNumber(120, 'ru')).toBe('120');
    expect(formatNumber(1234.5, 'ru')).toBe('1234,5');
  });

  it('should not throw for a number that is not finite', () => {
    expect(formatNumber(Number.NaN, 'ru')).toBe('NaN');
  });
});
