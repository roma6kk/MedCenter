'use client';

import type { ReactNode } from 'react';
import { RouteErrorPage } from '@/components/feedback/route-pages';

export default function GlobalError({ reset }: { readonly reset: () => void }): ReactNode {
  return <RouteErrorPage reset={reset} />;
}
