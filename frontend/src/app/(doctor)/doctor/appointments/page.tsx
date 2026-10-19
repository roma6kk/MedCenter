import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { DoctorJournal } from '@/components/doctor/doctor-journal';

export default function DoctorJournalPage(): ReactNode {
  // `useSearchParams` (the day in `?date=`) needs a Suspense boundary above it for the static shell to build.
  return (
    <Suspense fallback={null}>
      <DoctorJournal />
    </Suspense>
  );
}
