'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api/api-fetch';
import { queryKeys } from '@/lib/api/query-keys';
import { useDialogFocus } from '@/hooks/use-dialog-focus';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';

interface UsageReference {
  readonly resourceType: 'Schedule' | 'Slot';
  readonly id: string;
  readonly display: string;
}

/**
 * Room occupancy side panel (API 4.7): lists the Schedule/Slot references that block
 * deletion (ROOM_IN_USE, FR-017). Mount it only while open; it traps focus and closes on Escape.
 */
export function RoomUsageDrawer({ roomId, onClose }: { readonly roomId: string; readonly onClose: () => void }): React.JSX.Element {
  const drawerRef = useDialogFocus<HTMLDivElement>(true, onClose);
  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.roomUsage(roomId),
    queryFn: () => apiFetch<{ items: UsageReference[] }>(`/api/v1/admin/rooms/${roomId}/usage`),
  });

  let body: React.JSX.Element;
  if (isPending) body = <TableSkeleton />;
  else if (isError) {
    body = (
      <ProblemBanner
        title="Не удалось загрузить занятость"
        errorCode={error instanceof ApiError ? error.problem.errorCode : undefined}
        requestId={error instanceof ApiError ? error.problem.requestId : undefined}
      />
    );
  } else if (data.items.length === 0) body = <EmptyState title="Кабинет свободен" description="Активных расписаний нет — кабинет можно удалить." />;
  else {
    body = (
      <ul className="mt-4 grid gap-2">
        {data.items.map((ref) => (
          <li key={`${ref.resourceType}-${ref.id}`} className="rounded-[6px] border border-[var(--border)] p-3 text-sm">
            <span className="mono text-xs text-[var(--muted-foreground)]">{ref.resourceType}</span> {ref.display}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="room-usage-title" className="fixed inset-y-0 right-0 w-full max-w-sm overflow-y-auto border-l border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <h2 id="room-usage-title" className="serif text-lg font-semibold">
          Занятость кабинета
        </h2>
        <button type="button" onClick={onClose} className="rounded-[6px] border border-[var(--border)] px-3 py-1 text-sm">
          Закрыть
        </button>
      </div>
      {body}
    </div>
  );
}
