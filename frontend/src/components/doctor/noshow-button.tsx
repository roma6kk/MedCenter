'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { queryKeys } from '@/lib/api/query-keys';

/** Marks a booked appointment as a no-show (API 6.6). Two-step: a confirm before the POST. */
export function NoshowButton({ appointmentId }: { readonly appointmentId: string }): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const markNoshow = useMutation({
    mutationFn: () => apiFetch(`/api/v1/doctor/appointments/${appointmentId}/noshow`, { method: 'POST' }),
    onSuccess: () => {
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ['doctorAppointments'] });
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointmentDetail(appointmentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
    },
  });

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="rounded-[6px] border border-[var(--border)] px-3 py-1 text-sm">
        Неявка
      </button>
    );
  }

  return (
    <span role="group" aria-label="Подтверждение неявки" className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => markNoshow.mutate()}
        disabled={markNoshow.isPending}
        className="rounded-[6px] border border-[var(--destructive)] px-3 py-1 text-sm text-[var(--destructive)] disabled:opacity-50"
      >
        Подтвердить неявку
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-sm underline">
        Отмена
      </button>
      {markNoshow.isError ? (
        <span role="alert" className="text-sm text-[var(--destructive)]">
          Не удалось отметить неявку
        </span>
      ) : null}
    </span>
  );
}
