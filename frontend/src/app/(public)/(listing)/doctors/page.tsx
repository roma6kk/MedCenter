import type { Metadata } from 'next';
import { loadDoctorPage, loadDoctors, loadServices } from '@/components/catalog/catalog-server';
import { DoctorCatalog } from '@/components/catalog/doctor-catalog';
import { buildDirectory, doctorQueryOf, optionQueryOf, parseDirectoryParams, type DirectoryParams } from '@/components/catalog/doctor-directory';
import { pageMetadata } from '@/lib/i18n/page-metadata';

export const metadata: Metadata = pageMetadata('catalog.doctorsTitle');

// Rendered per request (the filters live in the URL, and `next build` cannot reach the API).
export const dynamic = 'force-dynamic';

interface DoctorsPageProps {
  readonly searchParams?: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function DoctorsPage({ searchParams }: DoctorsPageProps): Promise<React.JSX.Element> {
  const params: DirectoryParams = parseDirectoryParams((await searchParams) ?? {});
  const [first, options, services] = await Promise.all([loadDoctorPage(doctorQueryOf(params)), loadDoctors(optionQueryOf(params)), loadServices()]);
  // A typed page past the end shows the last page instead of an empty list.
  const lastPage: number = first.ok ? first.data.meta.totalPages : 0;
  const doctors = first.ok && params.page > lastPage && lastPage > 0 ? await loadDoctorPage(doctorQueryOf({ ...params, page: lastPage })) : first;
  return (
    <DoctorCatalog
      params={params}
      services={services.ok ? services.data : []}
      directory={doctors.ok ? buildDirectory(doctors.data, options.ok ? options.data : []) : null}
    />
  );
}
