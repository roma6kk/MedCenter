import type { ReactNode } from 'react';
import { AuthCardHeader } from '@/components/auth/auth-card-header';
import { Providers } from '@/components/providers';

/**
 * Centered card of the sign-in and registration screens. `Providers` mounts the toast region (e.g. "session ended");
 * the header row (home link, language switch) is here because these are the only screens without a shell header
 * (frontend-design-spec §7).
 */
export default function AuthGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <Providers>
      <main id="main-content" className="mx-auto flex min-h-screen max-w-[400px] items-center justify-center p-4">
        <div className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-6">
          <AuthCardHeader />
          {children}
        </div>
      </main>
    </Providers>
  );
}
