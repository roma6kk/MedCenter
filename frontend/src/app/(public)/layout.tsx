import type { ReactNode } from 'react';
import { PublicShell } from '@/components/catalog/public-shell';
import { Providers } from '@/components/providers';

/** Frame of the public catalog. `Providers` mounts the toast region and the session probe (the header shows the cabinet link when signed in). */
export default function PublicGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <Providers>
      <PublicShell>{children}</PublicShell>
    </Providers>
  );
}
