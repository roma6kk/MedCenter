import { redirect } from 'next/navigation';

export default function PrescriptionsPage(): never {
  redirect('/medcard?tab=prescriptions');
}
