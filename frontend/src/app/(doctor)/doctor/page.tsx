import { redirect } from 'next/navigation';

export default function DoctorIndexPage(): never {
  redirect('/doctor/appointments');
}
