'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, idempotencyKey, ApiError } from '@/lib/api/api-fetch';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { SlotPicker } from './slot-picker';

export function BookingWizard(): React.JSX.Element {
  const draft = useBookingDraftStore();
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState(false);
  const booking = useMutation({
    mutationFn: (slotId: string) => {
      const key = draft.idempotencyKey ?? idempotencyKey();
      if (!draft.idempotencyKey) draft.updateDraft({ idempotencyKey: key });
      return apiFetch<{ id: string }>('/api/v1/appointments', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ slotId }) });
    },
    onSuccess: () => {
      setConflict(false);
      draft.clearDraft();
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.problem.errorCode === 'SLOT_CONFLICT') {
        setConflict(true);
        void queryClient.invalidateQueries({ queryKey: ['slots'] });
      }
    },
  });
  return (
    <section aria-label="Мастер записи">
      <ol className="flex gap-2 text-sm">
        <li aria-current={draft.step === 1 ? 'step' : undefined}>1. Врач</li>
        <li aria-current={draft.step === 2 ? 'step' : undefined}>2. Услуга</li>
        <li aria-current={draft.step === 3 ? 'step' : undefined}>3. Время</li>
        <li aria-current={draft.step === 4 ? 'step' : undefined}>4. Подтверждение</li>
      </ol>
      <div className="mt-4">
        <SlotPicker scheduleId={draft.doctorId ?? 'default'} selectedSlotId={draft.slotId} onSelect={(id) => draft.updateDraft({ slotId: id, step: 4 })} />
      </div>
      {conflict ? <p role="alert" aria-live="assertive" data-testid="slot-conflict-toast" className="mt-3 rounded-[6px] border border-[var(--destructive)] p-3">Слот только что заняли. Выберите другое время.</p> : null}
      {booking.isSuccess ? <p data-testid="booking-success">Запись создана.</p> : null}
      <button type="button" disabled={!draft.slotId || booking.isPending} onClick={() => { if (draft.slotId) booking.mutate(draft.slotId); }} className="no-print mt-4 rounded-[6px] bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)] disabled:opacity-50">Подтвердить запись</button>
    </section>
  );
}
