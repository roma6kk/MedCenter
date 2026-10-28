import { redirect } from 'next/navigation';

/** The prescriptions are the second tab of the medical record now (B6): the old address keeps working. */
export default function PrescriptionsPage(): never {
  redirect('/medcard?tab=prescriptions');
}
