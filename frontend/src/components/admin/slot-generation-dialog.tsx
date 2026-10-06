'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, idempotencyKey } from '@/lib/api/api-fetch';

export function SlotGenerationDialog({ scheduleId }: { readonly scheduleId: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ generated: number; skipped: number } | null>(null);
  const queryClient = useQueryClient();
  const generate = useMutation({
    mutationFn: () => apiFetch<{ generated: number; skipped: number }>(`/api/v1/admin/schedules/${scheduleId}/generate`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({}) }),
    onSuccess: (data) => { setResult(data); void queryClient.invalidateQueries({ queryKey: ['adminSchedules'] }); },
  });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)} className="rounded-[6px] border border-[var(--border)] px-3 py-1">Сгенерировать слоты</button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="Генерация слотов" className="fixed inset-0 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-[6px] bg-[var(--card)] p-4">
            <h2 className="serif text-lg font-semibold">Генерация слотов</h2>
            {result ? <p data-testid="generation-result">Создано: {result.generated}, пропущено: {result.skipped}</p> : null}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => generate.mutate()} className="rounded-[6px] bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)]">Запустить</button>
              <button type="button" onClick={() => setOpen(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
