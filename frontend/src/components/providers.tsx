'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { loadSession } from '@/lib/auth/session-client';

function SessionHydrator(): null {
  useEffect(() => {
    void loadSession();
  }, []);
  return null;
}

export function Providers({ children }: { readonly children: ReactNode }): ReactNode {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <SessionHydrator />
      {children}
    </QueryClientProvider>
  );
}
