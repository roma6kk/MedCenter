import type { Metadata } from 'next';
import { BookingScreen } from '@/components/booking/booking-screen';
import { parseFhirId } from '@/components/catalog/doctor-directory';
import { PatientShell } from '@/components/layout/patient-shell';

export const metadata: Metadata = { title: 'Запись на приём — МедЦентр' };

interface BookingPageProps {
  readonly searchParams?: Promise<{ doctorId?: string | string[] }>;
}

export default async function BookingPage({ searchParams }: BookingPageProps): Promise<React.JSX.Element> {
  const doctorId: string | undefined = parseFhirId((await searchParams)?.doctorId);
  return (
    <PatientShell>
      <BookingScreen {...(doctorId === undefined ? {} : { presetDoctorId: doctorId })} />
    </PatientShell>
  );
}
