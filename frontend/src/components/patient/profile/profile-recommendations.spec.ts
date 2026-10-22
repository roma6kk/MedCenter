import { appointmentFixture } from '@/components/appointments/appointment-fixtures';
import { historyFixture, medicationFixture, serviceFixture } from '../cabinet-fixtures';
import { buildRecommendations, ECG_MIN_AGE_YEARS, isEcgVisit, REPEAT_VISIT_WINDOW_DAYS, type RecommendationInput } from './profile-recommendations';

const TODAY = '2026-10-22';

function input(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return { birthDate: '1992-11-02', hasPhone: true, history: [], historyComplete: true, appointments: [], prescriptions: [], today: TODAY, ...overrides };
}

const ids = (overrides: Partial<RecommendationInput>): string[] => buildRecommendations(input(overrides)).map((item) => item.id);
const ecgVisit = (date: string) => historyFixture({ id: `ecg-${date}`, date, serviceType: { display: 'ЭКГ с расшифровкой' }, recommendations: undefined });

describe('buildRecommendations', () => {
  it('should be empty for a young patient with a phone and no history', () => {
    expect(ids({})).toEqual([]);
  });

  describe('repeat visit', () => {
    it('should suggest a repeat visit after a finished visit with a recommendation and no booked follow-up', () => {
      const [first] = buildRecommendations(input({ history: [historyFixture({ date: '2026-10-19T07:00:00.000Z' })] }));
      expect(first).toMatchObject({ id: 'repeat-visit', kind: 'follow-up', ctaHref: '/booking', params: { day: '2026-10-19' } });
    });

    it('should not suggest it when a later appointment is booked, and ignore a cancelled one', () => {
      const history = [historyFixture({ date: '2026-10-19T07:00:00.000Z' })];
      expect(ids({ history, appointments: [appointmentFixture({ start: '2026-10-28T07:00:00.000Z' })] })).toEqual([]);
      expect(ids({ history, appointments: [appointmentFixture({ start: '2026-10-28T07:00:00.000Z', status: 'cancelled' })] })).toEqual(['repeat-visit']);
    });

    it('should not suggest it without a recommendation, for an unfinished visit or after the window', () => {
      expect(ids({ history: [historyFixture({ date: '2026-10-19T07:00:00.000Z', recommendations: ' ' })] })).toEqual([]);
      expect(ids({ history: [historyFixture({ date: '2026-10-19T07:00:00.000Z', status: 'in-progress' })] })).toEqual([]);
      expect(ids({ history: [historyFixture({ date: '2026-07-01T07:00:00.000Z' })] })).toEqual([]);
    });

    it('should judge by the newest finished visit and keep the window edge inclusive', () => {
      const edge = new Date(Date.parse(`${TODAY}T12:00:00Z`) - REPEAT_VISIT_WINDOW_DAYS * 86_400_000).toISOString();
      expect(ids({ history: [historyFixture({ date: edge })] })).toEqual(['repeat-visit']);
      expect(ids({ history: [historyFixture({ id: 'old', date: '2026-10-01T07:00:00.000Z' }), historyFixture({ id: 'new', date: '2026-10-20T07:00:00.000Z', recommendations: '' })] })).toEqual([]);
    });
  });

  describe('yearly ECG', () => {
    it('should suggest an ECG from the age threshold when the whole history has none', () => {
      expect(ECG_MIN_AGE_YEARS).toBe(40);
      expect(ids({ birthDate: '1985-03-14' })).toEqual(['ecg']);
      expect(ids({ birthDate: '1986-10-22' })).toEqual(['ecg']);
    });

    it('should stay off under 40, for a birth year without a day, and without a birth date', () => {
      expect(ids({ birthDate: '1986-10-23' })).toEqual([]);
      expect(ids({ birthDate: '1960' })).toEqual([]);
      expect(ids({ birthDate: undefined })).toEqual([]);
    });

    it('should stay off when an ECG visit is within a year and say "old" when the last one is older', () => {
      expect(ids({ birthDate: '1985-03-14', history: [ecgVisit('2026-03-01T07:00:00.000Z')] })).toEqual([]);
      const [old] = buildRecommendations(input({ birthDate: '1985-03-14', history: [ecgVisit('2025-03-01T07:00:00.000Z')] }));
      expect(old).toMatchObject({ id: 'ecg', textKey: 'reco.ecg.textOld' });
    });

    it('should stay off when only part of the history is loaded and shows no ECG', () => {
      expect(ids({ birthDate: '1985-03-14', historyComplete: false })).toEqual([]);
    });

    it('should recognise an ECG only by the service name', () => {
      expect(isEcgVisit(ecgVisit('2026-03-01T07:00:00.000Z'))).toBe(true);
      expect(isEcgVisit(historyFixture({ serviceType: { display: 'Electrocardiography' } }))).toBe(true);
      expect(isEcgVisit(historyFixture({ serviceType: { code: 'ECG' } }))).toBe(false);
      expect(isEcgVisit(historyFixture({ serviceType: { display: 'Приём терапевта' } }))).toBe(false);
    });
  });

  describe('phone', () => {
    it('should ask for a phone only when the card is known to have none', () => {
      expect(buildRecommendations(input({ hasPhone: false }))).toEqual([expect.objectContaining({ id: 'phone', kind: 'profile', ctaHref: '#profile-data' })]);
      expect(ids({ hasPhone: undefined })).toEqual([]);
    });
  });

  describe('open referral', () => {
    it('should suggest booking for each active referral and not for medications or finished ones', () => {
      const prescriptions = [serviceFixture({ id: 'a', status: 'active', display: 'Общий анализ крови' }), serviceFixture({ id: 'b', status: 'completed' }), medicationFixture({ id: 'c', status: 'active' })];
      expect(buildRecommendations(input({ prescriptions }))).toEqual([expect.objectContaining({ id: 'referral-a', params: { name: 'Общий анализ крови' } })]);
    });
  });

  it('should order care after a visit, referrals, prevention, then the profile', () => {
    const result = ids({
      birthDate: '1985-03-14',
      hasPhone: false,
      history: [historyFixture({ date: '2026-10-19T07:00:00.000Z' })],
      prescriptions: [serviceFixture({ id: 'a', status: 'active' })],
    });
    expect(result).toEqual(['repeat-visit', 'referral-a', 'ecg', 'phone']);
  });
});
