'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { PatientShell } from '@/components/layout/patient-shell';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';

interface Notification { id: string; text: string; read: boolean; }

export default function NotificationsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiFetch<{ items: Notification[] }>('/api/v1/me/notifications'),
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/me/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['notifications'] }); void queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] }); },
  });
  return (
    <PatientShell>
      <h1 className="serif text-2xl font-bold">Уведомления</h1>
      {isPending ? <div className="mt-4"><TableSkeleton /></div> : null}
      {data && data.items.length === 0 ? <EmptyState title="Нет уведомлений" /> : null}
      <ul className="mt-4 grid gap-2">
        {data?.items.map((n) => (
          <li key={n.id} className="flex items-center justify-between rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-3">
            <span className="text-sm">{n.text}</span>
            {!n.read ? <button type="button" onClick={() => markRead.mutate(n.id)} className="text-sm underline">Прочитано</button> : null}
          </li>
        ))}
      </ul>
    </PatientShell>
  );
}
