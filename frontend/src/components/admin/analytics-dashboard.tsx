'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { TableSkeleton } from '@/components/feedback/states';

export function AnalyticsDashboard(): React.JSX.Element {
  const [from, setFrom] = useState('2026-01-01');
  const [to, setTo] = useState('2026-12-31');
  const { data, isPending } = useQuery({
    queryKey: ['analytics', 'appointments', { from, to }],
    queryFn: () => apiFetch<{ booked: number; cancelled: number; noshow: number }>(`/api/v1/admin/analytics/appointments?from=${from}&to=${to}`),
  });
  return (
    <section aria-label="Аналитика">
      <div className="flex gap-2">
        <label htmlFor="analytics-from">С <input id="analytics-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-[6px] border border-[var(--input)] p-1" /></label>
        <label htmlFor="analytics-to">По <input id="analytics-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-[6px] border border-[var(--input)] p-1" /></label>
      </div>
      {isPending ? <div className="mt-4"><TableSkeleton /></div> : (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <article className="rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-4"><p className="serif text-3xl font-bold">{data?.booked ?? 0}</p><p className="text-sm">Записано</p></article>
          <article className="rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-4"><p className="serif text-3xl font-bold">{data?.cancelled ?? 0}</p><p className="text-sm">Отменено</p></article>
          <article className="rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-4"><p className="serif text-3xl font-bold">{data?.noshow ?? 0}</p><p className="text-sm">Неявки</p></article>
        </div>
      )}
    </section>
  );
}
