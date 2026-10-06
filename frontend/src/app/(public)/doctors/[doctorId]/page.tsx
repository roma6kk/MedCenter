import Link from 'next/link';
import { NotFoundState } from '@/components/feedback/states';
import { publicApiFetch } from '@/lib/server-fetch';

interface Doctor { id: string; name: string; specialty: string; }

async function getDoctor(doctorId: string): Promise<Doctor | null> {
  const result = await publicApiFetch<Doctor>(`/api/v1/doctors/${encodeURIComponent(doctorId)}`);
  return result.ok ? result.data : null;
}

export default async function DoctorProfilePage({ params }: { readonly params: Promise<{ doctorId: string }> }): Promise<React.JSX.Element> {
  const { doctorId } = await params;
  const doctor = await getDoctor(doctorId);
  if (doctor === null) {
    return <NotFoundState title="Врач не найден" description="Возможно, профиль недоступен или был удалён." />;
  }
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="serif text-2xl font-bold">{doctor.name}</h1>
      <p className="text-sm text-[var(--muted-foreground)]">{doctor.specialty}</p>
      <p className="mono mt-2 text-sm">{doctor.id}</p>
      <Link href={`/booking?doctorId=${encodeURIComponent(doctor.id)}`} className="mt-4 inline-block rounded-[6px] bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)]">Записаться</Link>
    </main>
  );
}
