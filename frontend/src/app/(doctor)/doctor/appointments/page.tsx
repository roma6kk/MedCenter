import { Suspense } from 'react';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { DoctorJournal } from '@/components/doctor/doctor-journal';
import { pageMetadata } from '@/lib/i18n/page-metadata';

export const metadata: Metadata = pageMetadata('doctor.journal.title');

export default function DoctorJournalPage(): ReactNode {
  return (
    <Suspense fallback={null}>
      <DoctorJournal />
    </Suspense>
  );
}
