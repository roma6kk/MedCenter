'use client';

import type { ReactNode } from 'react';
import { useContext, useEffect, useRef, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { Toaster } from '@/components/feedback/toaster';
import { ThemeSync } from '@/components/layout/theme-sync';
import { createAppQueryClient } from '@/lib/api/query-client';
import { ensureSession } from '@/lib/auth/session-client';
import { CLINIC_TIME_ZONE } from '@/lib/clinic-time';
import { readLocaleCookie, readStoredLocale, writeLocaleCookie } from '@/lib/i18n/locale';
import { MESSAGES } from '@/lib/i18n/translate';
import { useUiStore } from '@/store/use-ui-store';

function SessionHydrator(): null {
  useEffect(() => {
    void ensureSession();
  }, []);
  return null;
}

// Reading storage during render would mismatch the server HTML, so the saved locale is restored after hydration.
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

// The server components read this cookie to ask the API for names in the viewer language; keep it in step with the locale.
function LocaleDataSync(): null {
  const locale = useUiStore((state) => state.locale);
  const router = useContext(AppRouterContext);
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const inCookie = readLocaleCookie();
    if (inCookie === locale) return;
    writeLocaleCookie(locale);
    router?.refresh();
  }, [locale, router]);
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
        <LocaleDataSync />
        <ThemeSync />
        {children}
        <Toaster />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}
