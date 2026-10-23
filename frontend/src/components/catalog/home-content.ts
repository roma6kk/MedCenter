import { Activity, Brain, HeartPulse, Scissors, Stethoscope, type LucideIcon } from 'lucide-react';

/**
 * Static content of the landing page. DEMONSTRATION DATA: the licence, the legal details, the contacts and the company
 * names exist to show the interface and are not claims about real agreements; replace them with the clinic's own
 * facts before the site is published (the page says so under the lists, see `home.demoNote`).
 */

export const CLINIC_LICENSE = { number: '02040/0123456', date: '14.03.2022' } as const;

export const CLINIC_LEGAL = { name: 'ООО «Лайфлайн»', unp: '100000000' } as const;

export const CLINIC_CONTACTS = {
  phone: '+375 17 000-00-00',
  phoneHref: 'tel:+375170000000',
  email: 'info@lifeline.example',
  corporateEmail: 'b2b@lifeline.example',
} as const;

/** Companies served under a contract (names only, no logos). */
export const CORPORATE_CLIENTS: ReadonlyArray<string> = [
  'Беларусбанк',
  'Белагропромбанк',
  'МТС Беларусь',
  'A1 Belarus',
  'Минский тракторный завод',
  'Белорусская калийная компания',
  'ЭПАМ Системз',
];

/** Insurers whose policies the clinic accepts (names only, no logos). */
export const INSURANCE_PARTNERS: ReadonlyArray<string> = ['Белгосстрах', 'ЭРГО Беларусь', 'Промтрансинвест', 'Белэксимгарант'];

export type DirectionId = 'therapy' | 'cardiology' | 'neurology' | 'surgery' | 'diagnostics';

export interface Direction {
  readonly id: DirectionId;
  readonly icon: LucideIcon;
  /** SNOMED CT code of the specialty (as the doctors carry it); absent for a service group such as diagnostics. */
  readonly specialtyCode?: string;
}

/** Directions of the clinic (the codes are those of the demo seed, tools/demo-seed/demo-catalog.ts); the texts live under `home.directions.<id>` in the message catalogues. */
export const DIRECTIONS: ReadonlyArray<Direction> = [
  { id: 'therapy', icon: Stethoscope, specialtyCode: '419192003' },
  { id: 'cardiology', icon: HeartPulse, specialtyCode: '394579002' },
  { id: 'neurology', icon: Brain, specialtyCode: '394591006' },
  { id: 'surgery', icon: Scissors, specialtyCode: '394609007' },
  { id: 'diagnostics', icon: Activity },
];

/** Anchors of the landing sections the header links to. */
export const HOME_ANCHORS = { directions: 'directions', companies: 'companies', contacts: 'contacts' } as const;
