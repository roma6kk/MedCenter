'use client';

import type { ReactNode } from 'react';
import { ProblemBanner } from '@/components/feedback/problem-banner';

export default function GlobalError({ error, reset }: { readonly error: Error; readonly reset: () => void }): ReactNode {
  return (
    <main className="mx-auto max-w-xl p-8">
      <ProblemBanner title="Что-то пошло не так" detail={error.message} errorCode="INTERNAL" />
      <button type="button" onClick={reset} className="mt-4 rounded-[6px] border border-[var(--border)] px-4 py-2">
        Повторить
      </button>
    </main>
  );
}
