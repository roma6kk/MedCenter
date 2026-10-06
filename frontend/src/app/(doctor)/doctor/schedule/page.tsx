'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { StaffShell, DOCTOR_LINKS } from '@/components/layout/staff-shell';
import { TableSkeleton } from '@/components/feedback/states';

export default function DoctorSchedulePage(): React.JSX.Element {
  const { data, isPending } = useQuery({ queryKey: ['doctorSchedule'], queryFn: () => apiFetch<{ items: Array<{ id: string; label: string }> }>('/api/v1/doctor/schedule') });
  return (
    <StaffShell links={DOCTOR_LINKS} title="Расписание">
      <h1 className="serif text-2xl font-bold">Моё расписание</h1>
      {isPending ? <div className="mt-4"><TableSkeleton /></div> : <ul className="mt-4 grid gap-2">{data?.items.map((s) => <li key={s.id} className="rounded-[6px] border border-[var(--border)] p-3 text-sm">{s.label}</li>)}</ul>}
    </StaffShell>
  );
}
