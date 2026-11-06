'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/use-t';
import { LocaleSwitcher } from './locale-switcher';
import { LogoutButton } from './logout-button';
import { closeOnLink, NavLink } from './nav-link';
import { ThemeSwitcher } from './theme-switcher';

interface PatientMenuLink {
  readonly href: string;
  readonly label: string;
}

interface PatientMobileMenuProps {
  readonly links: ReadonlyArray<PatientMenuLink>;
  readonly linkClassName: string;
  readonly activeLinkClassName: string;
}

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
