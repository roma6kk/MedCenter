import { createTranslate } from '@/lib/i18n/translate';
import { describeWhen } from './slot-when';

const t = createTranslate('ru', 'booking');

describe('describeWhen', () => {
  it('should say today when the slot is on the clinic day', () => {
    expect(describeWhen('2026-10-26T06:00:00.000Z', '2026-10-26', 'ru', t)).toBe('сегодня, 09:00');
  });

  it('should say tomorrow when the slot is on the next clinic day', () => {
    expect(describeWhen('2026-10-27T06:00:00.000Z', '2026-10-26', 'ru', t)).toBe('завтра, 09:00');
  });

  it('should name the date when the slot is later', () => {
    expect(describeWhen('2026-10-30T06:30:00.000Z', '2026-10-26', 'ru', t)).toBe('30 окт., 09:30');
  });

  it('should read the clinic calendar when the instant is a late evening in UTC but already the next day in Minsk', () => {
    expect(describeWhen('2026-10-26T21:30:00.000Z', '2026-10-26', 'ru', t)).toBe('завтра, 00:30');
  });
});
