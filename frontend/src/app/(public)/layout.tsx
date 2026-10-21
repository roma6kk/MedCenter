import type { ReactNode } from 'react';
import { PublicShell } from '@/components/catalog/public-shell';

/** Frame of the public catalog (the header shows the cabinet link when signed in; the providers come from the root layout). */
export default function PublicGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return <PublicShell>{children}</PublicShell>;
}
