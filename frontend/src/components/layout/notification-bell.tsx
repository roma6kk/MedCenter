'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { apiFetch } from '@/lib/api/api-fetch';

export function NotificationBell(): ReactNode {
  const { data } = useQuery({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: () => apiFetch<{ unread: number }>('/api/v1/me/notifications/unread-count'),
    refetchInterval: 30_000,
  });
  const unread = data?.unread ?? 0;
  return (
    <Link href="/notifications" aria-label={`Уведомления, непрочитанных: ${unread}`} className="relative rounded-[6px] border border-[var(--border)] p-2">
      <Bell size={18} strokeWidth={1.5} />
      {unread > 0 ? (
        <span data-testid="unread-badge" className="absolute -right-1 -top-1 rounded-full bg-[var(--destructive)] px-1 text-[10px] text-white">
          {unread}
        </span>
      ) : null}
    </Link>
  );
}
