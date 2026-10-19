import type { Metadata } from 'next';
import { loadDoctors, loadServices } from '@/components/catalog/catalog-server';
import { HomeView } from '@/components/catalog/home-view';

export const metadata: Metadata = { title: 'Медицинский центр' };

// Rendered per request, never at build time: `next build` runs where the API is unreachable (docker build), and a
// prerendered page would bake the error banner into the static HTML.
export const dynamic = 'force-dynamic';

export default async function HomePage(): Promise<React.JSX.Element> {
  const [services, doctors] = await Promise.all([loadServices(), loadDoctors()]);
  return (
    <HomeView
      services={services.ok ? services.data : []}
      doctors={doctors.ok ? doctors.data : []}
      isFailed={!services.ok && !doctors.ok}
    />
  );
}
