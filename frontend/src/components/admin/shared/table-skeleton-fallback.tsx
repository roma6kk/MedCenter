import type { ReactNode } from 'react';
import { TableSkeleton } from '@/components/feedback/states';

export function TableSkeletonFallback(): ReactNode {
  return (
    <div className="mt-4">
      <TableSkeleton />
    </div>
  );
}
