'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api/api-fetch';

export function TerminologyImportPanel(): React.JSX.Element {
  const [running, setRunning] = useState(false);
  const [alreadyRunning, setAlreadyRunning] = useState(false);
  const start = useMutation({
    mutationFn: () => apiFetch('/api/v1/admin/terminology/import', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => { setRunning(true); setAlreadyRunning(false); },
    onError: (e) => { if (e instanceof ApiError && e.status === 409) setAlreadyRunning(true); },
  });
  return (
    <section aria-label="Импорт терминологии" className="rounded-[6px] border border-[var(--border)] p-4">
      <h2 className="font-semibold">Импорт терминологии</h2>
      {running ? <p role="status">Импорт выполняется</p> : null}
      {alreadyRunning ? <p role="status">Импорт уже выполняется</p> : null}
      <button type="button" onClick={() => start.mutate()} className="mt-2 rounded-[6px] bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)]">Запустить импорт</button>
    </section>
  );
}
