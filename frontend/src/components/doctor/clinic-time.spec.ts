import { useUiStore } from '@/store/use-ui-store';
import { ageInYears, formatDateKey, formatMinskTime, isDateKey, minskDayBounds, minskDayKeyOf, shiftDateKey } from './clinic-time';

describe('clinic-time', () => {
  describe('minskDayBounds', () => {
    it('should bound a clinic day with the Minsk offset when the day is requested', () => {
      expect(minskDayBounds('2026-10-20')).toEqual({ from: '2026-10-20T00:00:00+03:00', to: '2026-10-20T23:59:59+03:00' });
    });
  });

  describe('shiftDateKey', () => {
    it('should cross a month boundary when a day is added', () => {
      expect(shiftDateKey('2026-10-31', 1)).toBe('2026-11-01');
    });

    it('should cross a year boundary when a day is subtracted', () => {
      expect(shiftDateKey('2027-01-01', -1)).toBe('2026-12-31');
    });

    it('should move by a whole period when several days are added', () => {
      expect(shiftDateKey('2026-10-16', 14)).toBe('2026-10-30');
    });
  });

  describe('isDateKey', () => {
    it('should accept a real calendar date', () => {
      expect(isDateKey('2026-02-28')).toBe(true);
    });

    it('should reject a date that does not exist', () => {
      expect(isDateKey('2026-02-30')).toBe(false);
    });

    it('should reject a partial or free-form value', () => {
      expect(isDateKey('2026-02')).toBe(false);
      expect(isDateKey('')).toBe(false);
    });
  });

  describe('minskDayKeyOf', () => {
    it('should read the clinic day when the UTC instant is already the next day in Minsk', () => {
      expect(minskDayKeyOf('2026-10-20T21:30:00Z')).toBe('2026-10-21');
    });

    it('should keep the same day when the instant is midday', () => {
      expect(minskDayKeyOf('2026-10-20T09:00:00Z')).toBe('2026-10-20');
    });
  });

  describe('formatMinskTime', () => {
    it('should show the clinic wall clock when the instant is given in UTC', () => {
      expect(formatMinskTime('2026-10-20T06:00:00Z')).toBe('09:00');
    });
  });

  describe('ageInYears', () => {
    it('should not count the current year when the birthday has not come yet', () => {
      expect(ageInYears('1978-07-21', '2026-07-20')).toBe(47);
    });

    it('should count the current year when today is the birthday', () => {
      expect(ageInYears('1978-07-21', '2026-07-21')).toBe(48);
    });

    it('should return null when FHIR sent only a year', () => {
      expect(ageInYears('1978', '2026-07-21')).toBeNull();
    });

    it('should return null when the birth date is in the future', () => {
      expect(ageInYears('2030-01-01', '2026-07-21')).toBeNull();
    });
  });

  describe('formatDateKey', () => {
    afterEach(() => useUiStore.setState({ locale: 'ru' }));

    it('should read a calendar day without drifting through the browser zone when the key is formatted', () => {
      expect(formatDateKey('2026-10-20')).toMatch(/^20 окт/);
    });

    it('should follow the English interface language when it is selected', () => {
      useUiStore.setState({ locale: 'en' });

      expect(formatDateKey('2026-10-20')).toMatch(/^20 Oct 2026/);
    });

    it('should return the text as it came when it is not a calendar day', () => {
      expect(formatDateKey('2026-10')).toBe('2026-10');
    });

    it('should spell the month out in the long style', () => {
      expect(formatDateKey('1978-07-21', 'long')).toMatch(/21 июля 1978/);
    });
  });

  describe('formatMinskTime in English', () => {
    afterEach(() => useUiStore.setState({ locale: 'ru' }));

    it('should keep the 24-hour clinic clock when the English interface is selected', () => {
      useUiStore.setState({ locale: 'en' });

      expect(formatMinskTime('2026-10-20T13:30:00Z')).toBe('16:30');
    });
  });
});
