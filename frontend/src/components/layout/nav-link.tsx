'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLinkProps {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Link of a shell navigation; marks the current section with `aria-current="page"` (WCAG 1.3.1 / 2.4.8). */
export function NavLink({ href, children, className }: NavLinkProps): ReactNode {
  const pathname: string | null = usePathname();
  const isCurrent: boolean = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      aria-current={isCurrent ? 'page' : undefined}
      className={`${className ?? ''} ${isCurrent ? 'font-semibold underline underline-offset-4' : ''}`.trim()}
    >
      {children}
    </Link>
  );
}
