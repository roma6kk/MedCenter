import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { rootMetadata } from '@/lib/i18n/page-metadata';
import { LOCALE_INIT_SCRIPT } from '@/lib/i18n/locale';
import { THEME_INIT_SCRIPT } from '@/lib/theme/theme';
import '@fontsource-variable/onest';
import '@fontsource-variable/jetbrains-mono';
import '../styles/globals.css';

export const metadata: Metadata = rootMetadata();

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
