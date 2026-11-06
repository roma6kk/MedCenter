import type { ReactNode } from 'react';
import { PublicShell } from '@/components/catalog/public-shell';

export default function PublicGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return <PublicShell>{children}</PublicShell>;
}
