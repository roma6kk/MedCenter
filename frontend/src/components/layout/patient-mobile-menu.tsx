'use client';

import { useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/use-t';
import { LocaleSwitcher } from './locale-switcher';
import { LogoutButton } from './logout-button';
import { NavLink } from './nav-link';
import { ThemeSwitcher } from './theme-switcher';

export interface PatientMenuLink {
  readonly href: string;
  readonly label: string;
}

interface PatientMobileMenuProps {
  readonly links: ReadonlyArray<PatientMenuLink>;
  readonly linkClassName: string;
  readonly activeLinkClassName: string;
}

/** A click on a link inside the drawer is a navigation: the drawer has done its job. */
function closeOnLink(event: MouseEvent<HTMLElement>, close: () => void): void {
  if ((event.target as HTMLElement).closest('a') !== null) close();
}

/**
 * The cabinet's navigation on a phone (T9): the three sections, the language, the theme and the sign-out live behind a burger
 * on the left of the header, in a drawer that grows out of the same side. Without it the header wrapped into three rows and
 * took a quarter of the screen before the content started. From `md` the header carries all of it again and this is hidden.
 */
export function PatientMobileMenu({ links, linkClassName, activeLinkClassName }: PatientMobileMenuProps): ReactNode {
  const t = useT('layout');
  const tPatient = useT('layout.patient');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  return (
    <>
      <button
        type="button"
        aria-label={t('menu.open')}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className="-ml-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-foreground hover:bg-secondary md:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>
      {isOpen ? (
        <Dialog variant="drawer-left" title={t('brand')} onClose={() => setIsOpen(false)}>
          <div className="flex flex-col gap-5" onClick={(event) => closeOnLink(event, () => setIsOpen(false))}>
            <nav aria-label={tPatient('navLabel')} className="flex flex-col gap-1">
              {links.map((link) => (
                <NavLink key={link.href} href={link.href} className={`${linkClassName} text-lg`} activeClassName={activeLinkClassName}>
                  {link.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-4">
              <LocaleSwitcher />
              <ThemeSwitcher compact />
            </div>
            <LogoutButton />
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
