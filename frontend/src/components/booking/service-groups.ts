import type { CatalogService, Doctor } from '@/components/catalog/catalog-types';

export interface ServiceSpecialty {
  readonly code?: string;
  readonly label?: string;
}

export interface ServiceGroup {
  readonly key: string;
  readonly specialty: ServiceSpecialty | null;
  readonly services: ReadonlyArray<CatalogService>;
}

export const OTHER_GROUP_KEY = 'other';

export function specialtyOfDoctors(doctors: ReadonlyArray<Doctor> | undefined): ServiceSpecialty | null {
  const doctor: Doctor | undefined = doctors?.find((item) => item.specialtyCode !== undefined || item.specialty !== undefined);
  if (doctor === undefined) return null;
  return {
    ...(doctor.specialtyCode === undefined ? {} : { code: doctor.specialtyCode }),
    ...(doctor.specialty === undefined ? {} : { label: doctor.specialty }),
  };
}

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
