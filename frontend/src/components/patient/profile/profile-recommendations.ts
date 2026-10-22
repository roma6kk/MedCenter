/**
 * profile-recommendations — what the clinic suggests to the patient next, computed only from data the cabinet already
 * has: age, finished visits (history), appointments, prescriptions and the contacts of the card. Pure: the clock is a
 * parameter. Rules that cannot be computed from these fields are not here (no "annual check-up" by guess, no "insurance").
 *
 * Keys are relative to the `patientProfile` message namespace.
 */
import { ageInYears, clinicDayOf, daysBetween } from '@/lib/clinic-time';
import type { AppointmentView } from '@/components/appointments/appointment-types';
import type { HistoryEntry, Prescription } from '../patient-types';

// ---------------------------------------------------------------------------------------------------------------------
// MEDICAL / CLINIC THRESHOLDS — these numbers are the clinic's decision, not the developers'. Change them here only on
// the clinic's instruction; the specs pin the current values.
// ---------------------------------------------------------------------------------------------------------------------

/** A patient of this age and older is offered a yearly ECG. */
export const ECG_MIN_AGE_YEARS = 40;
/** An ECG in the last this-many days counts as "yearly ECG done". */
export const ECG_INTERVAL_DAYS = 365;
/** A repeat visit is suggested for this many days after a finished visit that ended with a doctor's recommendation. */
export const REPEAT_VISIT_WINDOW_DAYS = 60;

/**
 * "ECG" is read from the display name of the service of a finished visit (`serviceType.display`): the codes of the national
 * catalogue are not known to the cabinet, the name is. A visit whose service has no name is not counted as an ECG.
 */
const ECG_NAME = /(?<!\p{L})(ЭКГ|ECG|EKG)(?!\p{L})|электрокардио|electrocardio/iu;

export type RecommendationKind = 'follow-up' | 'referral' | 'prevention' | 'profile';

export interface Recommendation {
  /** Stable: the hidden ones are remembered by id (`repeat-visit`, `referral-<prescription id>`, `ecg`, `phone`). */
  readonly id: string;
  readonly kind: RecommendationKind;
  readonly titleKey: string;
  readonly textKey: string;
  readonly ctaKey: string;
  /** A route, or an anchor of the profile page itself. */
  readonly ctaHref: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface RecommendationInput {
  /** FHIR `birthDate`; may be a year only (then the age is unknown and age rules stay off). */
  readonly birthDate: string | undefined;
  /** `undefined` while the card is not loaded: the phone rule needs to know the card. */
  readonly hasPhone: boolean | undefined;
  readonly history: ReadonlyArray<HistoryEntry>;
  /** Whether `history` is the whole history. If not, "there is no ECG in it" is not known and that rule stays off. */
  readonly historyComplete: boolean;
  /** Upcoming appointments (cancelled ones included: they are ignored here). */
  readonly appointments: ReadonlyArray<AppointmentView>;
  readonly prescriptions: ReadonlyArray<Prescription>;
  /** Today in the clinic zone, `YYYY-MM-DD`. */
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
    : { id: 'repeat-visit', kind: 'follow-up', titleKey: 'reco.repeat.title', textKey: 'reco.repeat.text', ctaKey: 'reco.repeat.cta', ctaHref: '/booking', params: { day: clinicDayOf(last.date) } };
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
  // Without the whole history an older ECG could be on a page we did not load.
  const olderEcg: boolean = history.some(isEcgVisit);
  if (!olderEcg && !historyComplete) return null;
  return { id: 'ecg', kind: 'prevention', titleKey: 'reco.ecg.title', textKey: olderEcg ? 'reco.ecg.textOld' : 'reco.ecg.text', ctaKey: 'reco.ecg.cta', ctaHref: '/booking' };
}

function addPhone({ hasPhone }: RecommendationInput): Recommendation | null {
  return hasPhone === false ? { id: 'phone', kind: 'profile', titleKey: 'reco.phone.title', textKey: 'reco.phone.text', ctaKey: 'reco.phone.cta', ctaHref: '#profile-data' } : null;
}

/** Ordered by what matters first: care after a visit, then open referrals, prevention, then the profile itself. */
export function buildRecommendations(input: RecommendationInput): ReadonlyArray<Recommendation> {
  return [repeatVisit(input), ...referrals(input), yearlyEcg(input), addPhone(input)].filter((item): item is Recommendation => item !== null);
}
