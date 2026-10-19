import { CatalogSkeleton } from '@/components/catalog/catalog-skeleton';

/** Shown while a public page reads the catalog on the server. */
export default function PublicLoading(): React.JSX.Element {
  return <CatalogSkeleton />;
}
