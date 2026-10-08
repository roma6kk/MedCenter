import type { ReactNode } from 'react';
import Link from 'next/link';
import { ForbiddenState } from '@/components/feedback/states';

export default function ForbiddenPage(): ReactNode {
  return (
    <ForbiddenState
      title="Этот раздел недоступен для вашей роли."
      action={
        <Link href="/" className="mt-4 inline-block rounded-[6px] border border-[var(--border)] px-4 py-2">
          На главную
        </Link>
      }
    />
  );
}
