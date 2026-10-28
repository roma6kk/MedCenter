import { redirect } from 'next/navigation';

/** The visit history is the first tab of the medical record now (B6): the old address keeps working. */
export default function HistoryPage(): never {
  redirect('/medcard');
}
