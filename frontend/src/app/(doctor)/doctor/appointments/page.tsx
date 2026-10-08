'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/api-fetch';
import { StaffShell, DOCTOR_LINKS } from '@/components/layout/staff-shell';
import { StampBadge, type StampStatus } from '@/components/feedback/stamp-badge';
import { TableSkeleton, EmptyState } from '@/components/feedback/states';
import { minskDateKey } from '@/lib/utils';
import { NoshowButton } from '@/components/doctor/noshow-button';

interface DayItem { id: string; time: string; patientName: string; status: StampStatus; }

export default function DoctorJournalPage(): React.JSX.Element {
  const [date] = useState(() => minskDateKey());
  const { data, isPending } = useQuery({
    queryKey: ['doctorAppointments', date],
    queryFn: () => apiFetch<{ items: DayItem[] }>(`/api/v1/doctor/appointments?date=${date}`),
  });
  return (
    <StaffShell links={DOCTOR_LINKS} title="Журнал приёма">
      <h1 className="serif text-2xl font-bold">Пациенты дня</h1>
      {isPending ? <div className="mt-4"><TableSkeleton /></div> : null}
      {data && data.items.length === 0 ? <EmptyState title="Нет записей на этот день" /> : null}
      <div className="mt-4 overflow-x-auto rounded-[6px] border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead><tr><th scope="col" className="h-11 px-3 text-left">Время</th><th scope="col" className="h-11 px-3 text-left">Пациент</th><th scope="col" className="h-11 px-3 text-left">Статус</th><th scope="col" className="h-11 px-3" /></tr></thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border)] hover:bg-[#F7F5EF]">
                <td className="mono h-11 px-3">{item.time}</td>
                <td className="h-11 px-3">{item.patientName}</td>
                <td className="h-11 px-3"><StampBadge status={item.status} /></td>
                <td className="h-11 px-3">
                  {item.status === 'booked' ? (
                    <span className="inline-flex flex-wrap items-center gap-3">
                      <Link href={`/encounters/${item.id}`} className="underline">Открыть приём</Link>
                      <NoshowButton appointmentId={item.id} />
                    </span>
                  ) : (
                    <span aria-hidden="true">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StaffShell>
  );
}
