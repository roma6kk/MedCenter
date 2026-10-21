import { CatalogSkeleton } from '@/components/catalog/catalog-skeleton';

/**
 * Shown while the home page and the doctor list read the catalog on the server. It lives in the `(listing)` group on purpose: a
 * `loading.tsx` above `doctors/[doctorId]` would stream the shell with status 200 before `notFound()` runs, and an unknown
 * doctor must answer a real 404.
 */
export default function PublicLoading(): React.JSX.Element {
  return <CatalogSkeleton />;
}
