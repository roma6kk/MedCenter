import type { Metadata } from 'next';
import { loadDoctors, loadServices } from '@/components/catalog/catalog-server';
import { DoctorCatalog } from '@/components/catalog/doctor-catalog';
import { buildDirectory, parseDirectoryParams, type DirectoryParams } from '@/components/catalog/doctor-directory';

export const metadata: Metadata = { title: 'Врачи — МедЦентр' };

// Rendered per request (the filters live in the URL, and `next build` cannot reach the API).
export const dynamic = 'force-dynamic';

interface DoctorsPageProps {
  readonly searchParams?: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function DoctorsPage({ searchParams }: DoctorsPageProps): Promise<React.JSX.Element> {
  const params: DirectoryParams = parseDirectoryParams((await searchParams) ?? {});
  const [doctors, services] = await Promise.all([
    loadDoctors({ ...(params.serviceId === undefined ? {} : { serviceId: params.serviceId }), ...(params.search === undefined ? {} : { search: params.search }) }),
    loadServices(),
  ]);
  return (
    <DoctorCatalog
      params={params}
      services={services.ok ? services.data : []}
      directory={doctors.ok ? buildDirectory(doctors.data, params) : null}
    />
  );
}
