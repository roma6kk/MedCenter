import { redirect } from 'next/navigation';

/** `/doctor` is the doctor's entry point; the journal is the working screen (frontend-design-spec §1). */
export default function DoctorIndexPage(): never {
  redirect('/doctor/appointments');
}
