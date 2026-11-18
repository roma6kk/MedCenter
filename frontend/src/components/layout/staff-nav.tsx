'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BrandMark } from '@/components/brand/brand-mark';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { NavLink } from './nav-link';

export interface StaffLink {
  readonly href: string;
  readonly labelKey: string;
  readonly icon?: LucideIcon;
}

const NAV_PILL = cn(
  'relative gap-3 rounded-control px-3 text-base font-medium text-foreground transition-colors duration-fast ease-out hover:bg-secondary',
  'aria-[current=page]:bg-primary-soft aria-[current=page]:font-semibold aria-[current=page]:text-primary-soft-foreground aria-[current=page]:no-underline',
  "aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-2.5 aria-[current=page]:before:left-0 aria-[current=page]:before:w-1 aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-primary aria-[current=page]:before:content-['']",
);

export function StaffBrand({ prefix }: { readonly prefix: 'doctor' | 'admin' }): ReactNode {
  const t = useT('layout');
  return (
    <p className="flex items-center gap-2.5 px-2">
      <BrandMark size={36} />
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-bold">{t('brand')}</span>
        <span className="text-xs text-muted-foreground">{t(`${prefix}.caption`)}</span>
      </span>
    </p>
  );
}

interface StaffNavProps {
  readonly links: ReadonlyArray<StaffLink>;
  readonly prefix: 'doctor' | 'admin';
}

export function StaffNav({ links, prefix }: StaffNavProps): ReactNode {
  const t = useT('layout');
  return (
    <nav aria-label={t(`${prefix}.navLabel`)} className="flex flex-col gap-1">
      {links.map((link) => {
        const Icon: LucideIcon | undefined = link.icon;
        return (
          <NavLink key={link.href} href={link.href} className={NAV_PILL}>
            {Icon ? <Icon aria-hidden="true" className="size-[18px] shrink-0" /> : null}
            {t(link.labelKey)}
          </NavLink>
        );
      })}
    </nav>
  );
}
