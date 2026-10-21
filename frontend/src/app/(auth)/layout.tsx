import type { ReactNode } from 'react';
import { AuthCardHeader } from '@/components/auth/auth-card-header';
import { SkipLink } from '@/components/layout/skip-link';

/**
 * Centered card of the sign-in and registration screens. The header row (home link, language switch) is here because
 * these are the only screens without a shell header (frontend-design-spec §7); the toast region (e.g. "session ended")
 * comes from the root providers.
 */
export default function AuthGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <>
      <SkipLink />
      <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-[400px] items-center justify-center p-4 focus:outline-none">
        <div className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-6">
          <AuthCardHeader />
          {children}
        </div>
      </main>
    </>
  );
}
