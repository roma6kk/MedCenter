'use client';

import { useRef } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

// A keyed CSS animation, not the View Transitions API: Next 15 has no stable hook for it.
export function PageTransition({ children }: { readonly children: ReactNode }): ReactNode {
  const pathname: string | null = usePathname();
  const landedOn = useRef<string | null>(pathname);
  const hasNavigated = useRef<boolean>(false);
  if (pathname !== landedOn.current) hasNavigated.current = true;
  return (
    <div key={pathname ?? ''} className={hasNavigated.current ? 'animate-fade-in' : undefined}>
      {children}
    </div>
  );
}
