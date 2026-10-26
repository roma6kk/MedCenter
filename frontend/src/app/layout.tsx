import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { rootMetadata } from '@/lib/i18n/page-metadata';
import { THEME_INIT_SCRIPT } from '@/lib/theme/theme';
import '@fontsource-variable/onest';
import '@fontsource-variable/jetbrains-mono';
import '../styles/globals.css';

export const metadata: Metadata = rootMetadata();

/**
 * One `Providers` for the whole app (query cache, locale, session probe, toasts), so the 404, 403 and error screens, which
 * sit outside every route group, are translated and announce toasts like any page. Skip links belong to the frames below
 * (each names its own `<main id="main-content">`): one localized link per page.
 *
 * The inline script in `<head>` sets `data-theme` before the first paint (the CSP allows inline scripts), so a dark-theme
 * viewer never sees a light flash; `suppressHydrationWarning` on `<html>` is for that attribute, which the server HTML lacks.
 */
export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
