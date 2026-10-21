'use client';

import type { ReactNode } from 'react';
import { RouteErrorPage } from '@/components/feedback/route-pages';

export default function GlobalError({ error, reset }: { readonly error: Error; readonly reset: () => void }): ReactNode {
  return <RouteErrorPage error={error} reset={reset} />;
}
