'use client';

import { useRef } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Route change inside a shell (VE1): the page fades in, the header and the sidebar around it stay still.
 *
 * Why a keyed CSS animation and not the View Transitions API: Next 15 has no stable hook for it (its `viewTransition`
 * flag is experimental), a wrapper around `router.push` would miss browser back/forward and plain `<Link>`s, and the API is
 * absent in part of the browsers we support. Keying the wrapper by the pathname restarts a CSS animation on every route
 * change in every browser, with nothing to polyfill.
 *
 * Opacity only, on purpose: a `transform` on this wrapper would turn it into the containing block of the `position: fixed`
 * bars inside the pages (the booking confirm bar, the landing's booking bar) and make them jump for the length of the
 * animation. The rise comes from the list entrances (`useStaggerOnce`). The first page of a visit is not animated: a fade on
 * the first paint only delays the content. Reduced motion drops the animation globally.
 */
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
