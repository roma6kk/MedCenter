'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { ApiError } from '@/lib/api/api-fetch';
import { formatMinskDateTime } from '@/lib/utils';

interface Slot { id: string; start: string; status: 'free' | 'busy'; }

export function SlotPicker({ scheduleId, selectedSlotId, onSelect }: { readonly scheduleId: string; readonly selectedSlotId: string | null; readonly onSelect: (id: string) => void }): React.JSX.Element {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['slots', scheduleId],
    queryFn: () => apiFetch<{ items: Slot[] }>(`/api/v1/schedules/${scheduleId}/slots?status=free`),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  if (isPending) return <TableSkeleton />;
  if (error && error instanceof ApiError && error.problem.errorCode === 'SLOT_CONFLICT') {
    return (
      <div>
        <div role="alert" aria-live="assertive" data-testid="slot-conflict-toast" className="rounded-[6px] border border-[var(--destructive)] p-3">Слот только что заняли</div>
        <button type="button" onClick={() => void refetch()} className="mt-2 underline">Обновить</button>
      </div>
    );
  }
  if (error) return <ProblemBanner title="Не удалось загрузить слоты" errorCode="INTERNAL" />;
  if (!data || data.items.length === 0) return <EmptyState title="Нет свободных слотов" description="Выберите другую дату." />;
  return (
    <ul className="grid gap-2" aria-label="Свободные слоты">
      {data.items.map((slot) => (
        <li key={slot.id}>
          <button type="button" aria-pressed={selectedSlotId === slot.id} onClick={() => onSelect(slot.id)} data-testid={`slot-${slot.id}`} className={`flex w-full items-center justify-between rounded-[6px] border p-3 ${selectedSlotId === slot.id ? 'border-[var(--primary)]' : 'border-[var(--border)]'}`}>
            <span className="mono">{formatMinskDateTime(slot.start)}</span>
            <StampBadge status={slot.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}
