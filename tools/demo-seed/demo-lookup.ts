import servicesSnapshot from '../terminology-seed/snapshot/services.json';
import {
  DOCTORS,
  ROOMS,
  SERVICES,
  SPECIALTIES,
  type DoctorDef,
  type RoomDef,
  type ServiceDef,
  type SpecialtyDef,
} from './demo-catalog';

/** Typed lookups over the static catalog; a dangling key is a programming error, so it throws. */
function find<T extends { readonly key: string }>(items: readonly T[], key: string, what: string): T {
  const item = items.find((candidate) => candidate.key === key);
  if (item === undefined) {
    throw new Error(`Unknown ${what} key "${key}" in the demo catalog`);
  }
  return item;
}

export const specialtyOf = (key: string): SpecialtyDef => find(SPECIALTIES, key, 'specialty');
export const roomOf = (key: string): RoomDef => find(ROOMS, key, 'room');
export const serviceOf = (key: string): ServiceDef => find(SERVICES, key, 'service');
export const doctorOf = (key: string): DoctorDef => find(DOCTORS, key, 'doctor');

/** Display of a НСИ ЦИСЗ service code from the terminology snapshot (the seed never invents a display). */
export function nsiServiceDisplay(typeCode: string): string {
  const concept = servicesSnapshot.find((candidate) => candidate.code === typeCode);
  if (concept === undefined) {
    throw new Error(`Service code ${typeCode} is not in the nsi-services terminology snapshot`);
  }
  return concept.display;
}
