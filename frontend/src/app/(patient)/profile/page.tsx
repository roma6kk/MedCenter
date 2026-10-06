'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { PatientShell } from '@/components/layout/patient-shell';

export default function ProfilePage(): React.JSX.Element {
  const { data } = useQuery({ queryKey: ['profile'], queryFn: () => apiFetch<{ email: string; firstName: string; lastName: string }>('/api/v1/me') });
  return (
    <PatientShell>
      <h1 className="serif text-2xl font-bold">Профиль</h1>
      {data ? <p className="mt-4">{data.lastName} {data.firstName} · {data.email}</p> : <p className="mt-4">Загрузка…</p>}
    </PatientShell>
  );
}
