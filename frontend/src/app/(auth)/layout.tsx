import type { ReactNode } from 'react';

export default function AuthGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <main className="mx-auto flex min-h-screen max-w-[400px] items-center justify-center p-4">
      <div className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-6">{children}</div>
    </main>
  );
}
