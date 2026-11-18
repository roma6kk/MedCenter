import { CatalogSkeleton } from '@/components/catalog/catalog-skeleton';

// Kept in the (listing) group: a loading.tsx above doctors/[doctorId] would stream 200 before notFound() and an unknown doctor must be a real 404.
export default function PublicLoading(): React.JSX.Element {
  return <CatalogSkeleton />;
}
