import { Suspense } from 'react';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { RoomsPanel } from '@/components/admin/rooms/rooms-panel';

export const metadata: Metadata = pageMetadata('admin.rooms.title');

export default function AdminRoomsPage(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <RoomsPanel />
    </Suspense>
  );
}
