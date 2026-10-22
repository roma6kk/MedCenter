import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { AuthCardHeader } from '@/components/auth/auth-card-header';
import { SkipLink } from '@/components/layout/skip-link';

/**
 * Centered card (on the page ground, brand and language switch above it) of the sign-in and registration screens. The header row (brand link, language switch) is here because
 * these are the only screens without a shell header (frontend-design-spec §7); the toast region (e.g. "session ended")
 * comes from the root providers.
 */
export default function AuthGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <>
      <SkipLink />
      <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-[460px] flex-col justify-center px-4 py-8 focus:outline-none">
        <AuthCardHeader />
        <Card radius="panel" padding="lg" className="sm:p-8">
          {children}
        </Card>
      </main>
    </>
  );
}
