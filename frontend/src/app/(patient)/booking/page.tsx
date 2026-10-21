import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { BookingScreen } from '@/components/booking/booking-screen';
import { parseFhirId } from '@/components/catalog/doctor-directory';

export const metadata: Metadata = pageMetadata('booking.title');

interface BookingPageProps {
  readonly searchParams?: Promise<{ doctorId?: string | string[] }>;
}

export default async function BookingPage({ searchParams }: BookingPageProps): Promise<React.JSX.Element> {
  const doctorId: string | undefined = parseFhirId((await searchParams)?.doctorId);
  return <BookingScreen {...(doctorId === undefined ? {} : { presetDoctorId: doctorId })} />;
}
