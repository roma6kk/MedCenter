/**
 * service-groups — the catalogue has no "direction" on a service, so the booking step groups services by the specialty of
 * the doctors who give them (the doctor catalogue knows `?serviceId=`). A service nobody gives, or whose doctors carry no
 * specialty, goes to the closing "other" group.
 */
import type { CatalogService, Doctor } from '@/components/catalog/catalog-types';

export interface ServiceSpecialty {
  readonly code?: string;
  readonly label?: string;
}

export interface ServiceGroup {
  /** The specialty code or label; `other` for the closing group. */
  readonly key: string;
  readonly specialty: ServiceSpecialty | null;
  readonly services: ReadonlyArray<CatalogService>;
}

export const OTHER_GROUP_KEY = 'other';

/** The specialty a service is filed under: that of its first doctor that has one. */
export function specialtyOfDoctors(doctors: ReadonlyArray<Doctor> | undefined): ServiceSpecialty | null {
  const doctor: Doctor | undefined = doctors?.find((item) => item.specialtyCode !== undefined || item.specialty !== undefined);
  if (doctor === undefined) return null;
  return {
    ...(doctor.specialtyCode === undefined ? {} : { code: doctor.specialtyCode }),
    ...(doctor.specialty === undefined ? {} : { label: doctor.specialty }),
  };
}

/** Groups keep the order in which the catalogue lists their first service; the "other" group is always last. */
export function groupServices(services: ReadonlyArray<CatalogService>, specialtyOf: (serviceId: string) => ServiceSpecialty | null): ReadonlyArray<ServiceGroup> {
  const groups = new Map<string, { specialty: ServiceSpecialty | null; services: CatalogService[] }>();
  services.forEach((service) => {
    const specialty: ServiceSpecialty | null = specialtyOf(service.id);
    const key: string = specialty === null ? OTHER_GROUP_KEY : (specialty.code ?? specialty.label ?? OTHER_GROUP_KEY);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { specialty: key === OTHER_GROUP_KEY ? null : specialty, services: [service] });
    else group.services.push(service);
  });
  const ordered = [...groups.entries()].map(([key, group]): ServiceGroup => ({ key, ...group }));
  return [...ordered.filter((group) => group.key !== OTHER_GROUP_KEY), ...ordered.filter((group) => group.key === OTHER_GROUP_KEY)];
}
