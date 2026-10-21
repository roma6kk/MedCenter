'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLinkProps {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
  /** An accessible name that differs from the visible content (an icon-only link). */
  readonly label?: string;
}

/** Every navigation link is at least 44 px tall (WCAG 2.5.8), whatever classes the shell adds. */
const TARGET_CLASS = 'inline-flex min-h-[44px] items-center';

/** Link of a shell navigation; marks the current section with `aria-current="page"` (WCAG 1.3.1 / 2.4.8). */
export function NavLink({ href, children, className, label }: NavLinkProps): ReactNode {
  const pathname: string | null = usePathname();
  const isCurrent: boolean = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      aria-current={isCurrent ? 'page' : undefined}
      aria-label={label}
      className={`${TARGET_CLASS} ${className ?? ''} ${isCurrent ? 'font-semibold underline underline-offset-4' : ''}`.trim()}
    >
      {children}
    </Link>
  );
}
