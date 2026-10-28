import { Stethoscope } from 'lucide-react';
import type { Doctor } from './catalog-types';
import { DIRECTIONS, type Direction, type DirectionTone } from './home-content';

/** A card of the «Направления» grid: a known department of the clinic, a specialty only the doctors carry, or the services group. */
export interface DirectionEntry {
  readonly key: string;
  readonly kind: 'specialty' | 'services';
  readonly icon: Direction['icon'];
  readonly tone: DirectionTone;
  /** Set for a known department: its texts live under `home.directions.<id>`. */
  readonly id?: Direction['id'];
  /** The doctors' own specialty text for a specialty the landing has no copy for. */
  readonly label?: string;
  readonly specialtyCode?: string;
}

/** Tones handed to specialties the landing knows nothing about, in turn. */
const EXTRA_TONES: ReadonlyArray<DirectionTone> = ['info', 'warm', 'success', 'primary'];

function knownEntry(direction: Direction): DirectionEntry {
  return {
    key: direction.id,
    kind: direction.specialtyCode === undefined ? 'services' : 'specialty',
    icon: direction.icon,
    tone: direction.tone,
    id: direction.id,
    ...(direction.specialtyCode === undefined ? {} : { specialtyCode: direction.specialtyCode }),
  };
}

/**
 * The cards of the directions grid, built from what the clinic really has (C4, TASK-004 S5): a department shows only when a
 * doctor of its specialty exists, a specialty the landing has no text for still gets a card with the doctors' own wording,
 * and the diagnostics card (a service group, not a specialty) only when there are services to lead to.
 * `doctors` undefined means the catalog could not be read: the known departments stay, nothing is invented.
 */
export function directionEntries(doctors: ReadonlyArray<Doctor> | undefined, hasServices: boolean): ReadonlyArray<DirectionEntry> {
  const known: ReadonlyArray<Direction> = DIRECTIONS.filter((direction) => direction.specialtyCode !== undefined);
  if (doctors === undefined) return known.map(knownEntry);
  const present = new Map<string, string | undefined>();
  doctors.forEach((doctor) => {
    if (doctor.specialtyCode !== undefined && doctor.specialtyCode !== '' && !present.has(doctor.specialtyCode)) present.set(doctor.specialtyCode, doctor.specialty);
  });
  const entries: DirectionEntry[] = known.filter((direction) => direction.specialtyCode !== undefined && present.has(direction.specialtyCode)).map(knownEntry);
  const knownCodes = new Set(known.map((direction) => direction.specialtyCode));
  [...present].filter(([code]) => !knownCodes.has(code)).forEach(([code, label], index) => {
    entries.push({
      key: code,
      kind: 'specialty',
      icon: Stethoscope,
      tone: EXTRA_TONES[index % EXTRA_TONES.length] ?? 'primary',
      specialtyCode: code,
      ...(label === undefined ? {} : { label }),
    });
  });
  const services: Direction | undefined = DIRECTIONS.find((direction) => direction.specialtyCode === undefined);
  return hasServices && services !== undefined ? [...entries, knownEntry(services)] : entries;
}

/** Columns of the grid by the number of cards, so one or two cards are not stretched over a row built for three. */
export function directionGridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 max-w-xl';
  if (count === 2) return 'md:grid-cols-2';
  if (count === 4) return 'md:grid-cols-2 lg:grid-cols-4';
  return 'md:grid-cols-2 lg:grid-cols-3';
}
