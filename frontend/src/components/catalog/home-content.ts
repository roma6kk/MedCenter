import { Activity, Brain, HeartPulse, Scissors, Stethoscope, type LucideIcon } from 'lucide-react';

export const CLINIC_LICENSE = { number: '02040/0123456', date: '14.03.2022' } as const;

export const CLINIC_LEGAL = { name: 'ООО «Лайфлайн»', unp: '100000000' } as const;

export const CLINIC_CONTACTS = {
  phone: '+375 17 000-00-00',
  phoneHref: 'tel:+375170000000',
  email: 'info@lifeline.example',
} as const;

export const CORPORATE_CLIENTS: ReadonlyArray<string> = [
  'Беларусбанк',
  'Белагропромбанк',
  'МТС Беларусь',
  'A1 Belarus',
  'Минский тракторный завод',
];

export const INSURANCE_PARTNERS: ReadonlyArray<string> = ['Белгосстрах', 'Промтрансинвест'];

export type DirectionId = 'therapy' | 'cardiology' | 'neurology' | 'surgery' | 'diagnostics';

export type DirectionTone = 'primary' | 'destructive' | 'info' | 'warm' | 'success';

export interface Direction {
  readonly id: DirectionId;
  readonly icon: LucideIcon;
  readonly tone: DirectionTone;
  readonly specialtyCode?: string;
}

export const DIRECTIONS: ReadonlyArray<Direction> = [
  { id: 'therapy', icon: Stethoscope, tone: 'primary', specialtyCode: '419192003' },
  { id: 'cardiology', icon: HeartPulse, tone: 'destructive', specialtyCode: '394579002' },
  { id: 'neurology', icon: Brain, tone: 'info', specialtyCode: '394591006' },
  { id: 'surgery', icon: Scissors, tone: 'warm', specialtyCode: '394609007' },
  { id: 'diagnostics', icon: Activity, tone: 'success' },
];

export const HOME_ANCHORS = { directions: 'directions', services: 'services', companies: 'companies', contacts: 'contacts' } as const;
