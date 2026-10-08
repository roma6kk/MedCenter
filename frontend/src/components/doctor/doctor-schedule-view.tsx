'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api/api-fetch';
import { queryKeys } from '@/lib/api/query-keys';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';

interface ScheduleItem {
  readonly id: string;
  readonly label: string;
}

/** The signed-in doctor's own schedule (API 5.2.7). The list shape is what the page already consumed. */
export function DoctorScheduleView(): React.JSX.Element {
  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.doctorSchedule,
    queryFn: () => apiFetch<{ items: ScheduleItem[] }>('/api/v1/doctor/schedule'),
  });

  if (isPending) return <TableSkeleton />;
  if (isError) {
    return (
      <ProblemBanner
        title="Не удалось загрузить расписание"
        errorCode={error instanceof ApiError ? error.problem.errorCode : undefined}
        requestId={error instanceof ApiError ? error.problem.requestId : undefined}
      />
    );
  }
  if (data.items.length === 0) return <EmptyState title="Расписание пусто" />;

  return (
    <ul className="mt-4 grid gap-2">
      {data.items.map((item) => (
        <li key={item.id} className="rounded-[6px] border border-[var(--border)] p-3 text-sm">
          {item.label}
        </li>
      ))}
    </ul>
  );
}
