import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Медицинский центр',
  description: 'Запись на приём и клиническая документация',
};

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <html lang="ru">
      <body>
        <a href="#main" className="skip-link">
          Перейти к содержимому
        </a>
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
