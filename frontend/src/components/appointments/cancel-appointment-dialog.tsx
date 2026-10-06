'use client';
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cancelAppointmentSchema, type CancelAppointmentForm } from '@/lib/contracts';
import { apiFetch } from '@/lib/api/api-fetch';
import { useDialogFocus } from '@/hooks/use-dialog-focus';

export function CancelAppointmentDialog({ appointmentId }: { readonly appointmentId: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const close = useCallback(() => setOpen(false), []);
  const dialogRef = useDialogFocus<HTMLFormElement>(open, close);
  const { register, handleSubmit, formState: { errors } } = useForm<CancelAppointmentForm>({ resolver: zodResolver(cancelAppointmentSchema) });
  const cancel = useMutation({
    mutationFn: (reason: string) => apiFetch(`/api/v1/appointments/${appointmentId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] });
    },
  });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)} className="rounded-[6px] border border-[var(--destructive)] px-3 py-1 text-[var(--destructive)]">Отменить</button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="Отмена записи" className="fixed inset-0 flex items-center justify-center bg-black/30 p-4">
          <form ref={dialogRef} onSubmit={handleSubmit((v) => cancel.mutate(v.reason))} className="w-full max-w-md rounded-[6px] bg-[var(--card)] p-4">
            <h2 className="serif text-lg font-semibold">Отмена записи</h2>
            <label htmlFor="cancel-reason" className="form-label mt-3 block">Причина (3–500 символов)</label>
            <textarea id="cancel-reason" {...register('reason')} className="mt-1 w-full rounded-[6px] border border-[var(--input)] p-2" />
            {errors.reason ? <p role="alert" className="text-sm text-[var(--destructive)]">{errors.reason.message}</p> : null}
            <div className="mt-3 flex gap-2">
              <button type="submit" className="rounded-[6px] bg-[var(--destructive)] px-4 py-2 text-white">Подтвердить</button>
              <button type="button" onClick={close}>Закрыть</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
