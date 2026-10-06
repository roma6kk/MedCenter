import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';

export default function PatientGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return <Providers>{children}</Providers>;
}
