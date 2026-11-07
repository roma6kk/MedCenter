import { ageInYears, clinicDayOf, daysBetween } from '@/lib/clinic-time';
import type { AppointmentView } from '@/components/appointments/appointment-types';
import type { HistoryEntry, Prescription } from '../patient-types';

export const ECG_MIN_AGE_YEARS = 40;
const ECG_INTERVAL_DAYS = 365;
export const REPEAT_VISIT_WINDOW_DAYS = 60;

// Service codes of the national catalogue are unknown to the cabinet: ECG is matched by display name.
const ECG_NAME = /(?<!\p{L})(ЭКГ|ECG|EKG)(?!\p{L})|электрокардио|electrocardio/iu;

export type RecommendationKind = 'follow-up' | 'referral' | 'prevention' | 'profile';

export interface Recommendation {
  readonly id: string;
  readonly kind: RecommendationKind;
  readonly titleKey: string;
  readonly textKey: string;
  readonly ctaKey: string;
  readonly ctaHref: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface RecommendationInput {
  readonly birthDate: string | undefined;
  readonly hasPhone: boolean | undefined;
  readonly history: ReadonlyArray<HistoryEntry>;
  readonly historyComplete: boolean;
  readonly appointments: ReadonlyArray<AppointmentView>;
  readonly prescriptions: ReadonlyArray<Prescription>;
  readonly today: string;
}

export function isEcgVisit(entry: HistoryEntry): boolean {
  return ECG_NAME.test(entry.serviceType?.display ?? '');
}

function byNewest(a: HistoryEntry, b: HistoryEntry): number {
  return Date.parse(b.date) - Date.parse(a.date);
}

function repeatVisit({ history, appointments, today }: RecommendationInput): Recommendation | null {
  const last: HistoryEntry | undefined = [...history].filter((entry) => entry.status === 'finished').sort(byNewest)[0];
  if (last === undefined || (last.recommendations ?? '').trim() === '') return null;
  const ago: number = daysBetween(clinicDayOf(last.date), today);
  if (!Number.isFinite(ago) || ago < 0 || ago > REPEAT_VISIT_WINDOW_DAYS) return null;
  const followUpBooked: boolean = appointments.some((item) => item.status === 'booked' && Date.parse(item.start) > Date.parse(last.date));
  return followUpBooked
    ? null
    : { id: `repeat-visit-${last.id}`, kind: 'follow-up', titleKey: 'reco.repeat.title', textKey: 'reco.repeat.text', ctaKey: 'reco.repeat.cta', ctaHref: '/booking', params: { day: clinicDayOf(last.date) } };
}

function referrals({ prescriptions }: RecommendationInput): ReadonlyArray<Recommendation> {
  return prescriptions
    .filter((item) => item.kind === 'service' && item.status === 'active')
    .map((item) => ({
      id: `referral-${item.id}`,
      kind: 'referral' as const,
      titleKey: 'reco.referral.title',
      textKey: 'reco.referral.text',
      ctaKey: 'reco.referral.cta',
      ctaHref: '/booking',
      params: { name: item.kind === 'service' ? (item.display ?? item.code) : '' },
    }));
}

function yearlyEcg({ birthDate, history, historyComplete, today }: RecommendationInput): Recommendation | null {
  const age: number | null = birthDate === undefined ? null : ageInYears(birthDate, today);
  if (age === null || age < ECG_MIN_AGE_YEARS) return null;
  const recentEcg: boolean = history.some((entry) => isEcgVisit(entry) && daysBetween(clinicDayOf(entry.date), today) <= ECG_INTERVAL_DAYS);
  if (recentEcg) return null;
  const olderEcg: boolean = history.some(isEcgVisit);
  if (!olderEcg && !historyComplete) return null;
  return { id: 'ecg', kind: 'prevention', titleKey: 'reco.ecg.title', textKey: olderEcg ? 'reco.ecg.textOld' : 'reco.ecg.text', ctaKey: 'reco.ecg.cta', ctaHref: '/booking' };
}

function addPhone({ hasPhone }: RecommendationInput): Recommendation | null {
  return hasPhone === false ? { id: 'phone', kind: 'profile', titleKey: 'reco.phone.title', textKey: 'reco.phone.text', ctaKey: 'reco.phone.cta', ctaHref: '#profile-data' } : null;
}

export function buildRecommendations(input: RecommendationInput): ReadonlyArray<Recommendation> {
  return [repeatVisit(input), ...referrals(input), yearlyEcg(input), addPhone(input)].filter((item): item is Recommendation => item !== null);
}
