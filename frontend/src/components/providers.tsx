'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { Toaster } from '@/components/feedback/toaster';
import { createAppQueryClient } from '@/lib/api/query-client';
import { ensureSession } from '@/lib/auth/session-client';
import { readStoredLocale } from '@/lib/i18n/locale';
import { MESSAGES } from '@/lib/i18n/translate';
import { useUiStore } from '@/store/use-ui-store';

const CLINIC_TIME_ZONE = 'Europe/Minsk';

function SessionHydrator(): null {
  useEffect(() => {
    void ensureSession();
  }, []);
  return null;
}

/** Restores the viewer's saved locale after hydration (reading storage during render would mismatch the server HTML). */
function LocaleSync(): null {
  const locale = useUiStore((state) => state.locale);
  useEffect(() => {
    const stored = readStoredLocale();
    if (stored !== null) useUiStore.setState({ locale: stored });
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}

export function Providers({ children }: { readonly children: ReactNode }): ReactNode {
  const [client] = useState(createAppQueryClient);
  const locale = useUiStore((state) => state.locale);
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone={CLINIC_TIME_ZONE}>
      <QueryClientProvider client={client}>
        <SessionHydrator />
        <LocaleSync />
        {children}
        <Toaster />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}
