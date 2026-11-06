import { loadDoctors, loadServices } from '@/components/catalog/catalog-server';
import { HomeView } from '@/components/catalog/home-view';

// Rendered per request: `next build` runs where the API is unreachable and a prerender would bake the error banner into the HTML.
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
