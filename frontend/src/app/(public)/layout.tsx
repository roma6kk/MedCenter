import type { ReactNode } from 'react';

export default function PublicGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return <>{children}</>;
}
