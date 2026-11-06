'use client';

import type { MouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/ui/cn';

interface NavLinkProps {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly label?: string;
  readonly activeClassName?: string;
}

const DEFAULT_ACTIVE_CLASS = 'font-semibold underline underline-offset-4';
const TARGET_CLASS = 'inline-flex min-h-[44px] items-center';

export const RENAVIGATE_EVENT = 'lifeline:renavigate';

export function closeOnLink(event: MouseEvent<HTMLElement>, close: () => void): void {
  if ((event.target as HTMLElement).closest('a') !== null) close();
}

export function NavLink({ href, children, className, label, activeClassName = DEFAULT_ACTIVE_CLASS }: NavLinkProps): ReactNode {
  const pathname: string | null = usePathname();
  const isCurrent: boolean = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      aria-current={isCurrent ? 'page' : undefined}
      aria-label={label}
      onClick={() => {
        if (pathname === href) window.dispatchEvent(new Event(RENAVIGATE_EVENT));
      }}
      className={cn(TARGET_CLASS, className, isCurrent && activeClassName)}
    >
      {children}
    </Link>
  );
}
