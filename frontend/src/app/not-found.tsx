import type { ReactNode } from 'react';
import Link from 'next/link';
import { NotFoundState } from '@/components/feedback/states';

export default function NotFound(): ReactNode {
  return (
    <NotFoundState
      title="Страница не найдена"
      action={
        <Link href="/" className="mt-4 inline-block rounded-[6px] border border-[var(--border)] px-4 py-2">
          На главную
        </Link>
      }
    />
  );
}
