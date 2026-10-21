import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { DoctorScheduleView } from '@/components/doctor/doctor-schedule-view';
import { pageMetadata } from '@/lib/i18n/page-metadata';

export const metadata: Metadata = pageMetadata('doctor.schedule.title');

export default function DoctorSchedulePage(): ReactNode {
  return <DoctorScheduleView />;
}
