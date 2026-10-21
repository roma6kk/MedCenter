import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadDoctor } from '@/components/catalog/catalog-server';
import { CatalogUnavailable } from '@/components/catalog/catalog-unavailable';
import { parseFhirId } from '@/components/catalog/doctor-directory';
import { DoctorProfile } from '@/components/catalog/doctor-profile';
import { pageMetadata } from '@/lib/i18n/page-metadata';

export const metadata: Metadata = pageMetadata('catalog.profile');

export const dynamic = 'force-dynamic';

/** An id the API refuses (400) or does not know (404) is "no such doctor"; any other failure is a banner, not a "not found". */
const MISSING_STATUSES: ReadonlyArray<number> = [400, 404];

export default async function DoctorProfilePage({ params }: { readonly params: Promise<{ doctorId: string }> }): Promise<React.JSX.Element> {
  const { doctorId } = await params;
  // `..` would be folded into the API path by the URL parser: no request for something that cannot be an id.
  if (parseFhirId(doctorId) === undefined) notFound();
  const result = await loadDoctor(doctorId);
  if (result.ok) return <DoctorProfile doctor={result.data} />;
  if (result.status !== undefined && MISSING_STATUSES.includes(result.status)) notFound();
  return <CatalogUnavailable namespace="catalog" retryHref={`/doctors/${encodeURIComponent(doctorId)}`} />;
}
