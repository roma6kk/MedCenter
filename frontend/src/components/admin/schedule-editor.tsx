'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api/api-fetch';
import { ProblemBanner } from '@/components/feedback/problem-banner';

const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function ScheduleEditor(): React.JSX.Element {
  const [overlap, setOverlap] = useState(false);
  const [days, setDays] = useState<string[]>(['MO', 'WE', 'FR']);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => apiFetch('/api/v1/admin/schedules', { method: 'POST', body: JSON.stringify({ days, horizonDays: 30 }) }),
    onSuccess: () => { setOverlap(false); void queryClient.invalidateQueries({ queryKey: ['adminSchedules'] }); },
    onError: (e) => { if (e instanceof ApiError && e.problem.errorCode === 'SCHEDULE_OVERLAP') setOverlap(true); },
  });
  return (
    <section aria-label="Редактор расписания" className={overlap ? 'rounded-[6px] border border-[var(--destructive)] p-4' : ''}>
      <div className="flex flex-wrap gap-2">
        {DAYS.map((day) => (
          <button key={day} type="button" aria-pressed={days.includes(day)} onClick={() => setDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day])} data-testid={`day-${day}`} className="rounded-[6px] border border-[var(--border)] px-3 py-1 text-sm">{day}</button>
        ))}
      </div>
      {overlap ? <div className="mt-3"><ProblemBanner title="Окна пересекаются" detail="Проверьте выделенные окна." errorCode="SCHEDULE_OVERLAP" /></div> : null}
      <button type="button" onClick={() => save.mutate()} className="mt-3 rounded-[6px] bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)]">Сохранить</button>
    </section>
  );
}
