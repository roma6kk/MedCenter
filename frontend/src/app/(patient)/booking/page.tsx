import { PatientShell } from '@/components/layout/patient-shell';
import { BookingWizard } from '@/components/booking/booking-wizard';

export default function BookingPage(): React.JSX.Element {
  return (
    <PatientShell>
      <h1 className="serif text-2xl font-bold">Запись на приём</h1>
      <div className="mt-4"><BookingWizard /></div>
    </PatientShell>
  );
}
