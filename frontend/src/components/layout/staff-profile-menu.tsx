'use client';

import type { ReactNode } from 'react';
import { ChevronsUpDown, LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { DropdownMenu, type MenuItem } from '@/components/ui/dropdown-menu';
import { logout } from '@/lib/auth/session-client';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import { useT } from '@/lib/i18n/use-t';
import { THEME_MODES, type ThemeMode } from '@/lib/theme/theme';
import { cn } from '@/lib/ui/cn';
import { useUiStore } from '@/store/use-ui-store';
import { useStaffProfile } from './use-staff-profile';

interface StaffProfileMenuProps {
  readonly variant: 'full' | 'avatar';
}

function useProfileItems(): ReadonlyArray<MenuItem> {
  const t = useT('layout');
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);
  const themeMode = useUiStore((state) => state.themeMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const languages: ReadonlyArray<MenuItem> = LOCALES.map((code: Locale, index) => ({
    key: `locale-${code}`,
    label: t(`languages.${code}`),
    checked: locale === code,
    ...(index === 0 ? { heading: t('language') } : {}),
    onSelect: () => setLocale(code),
  }));
  const themes: ReadonlyArray<MenuItem> = THEME_MODES.map((mode: ThemeMode, index) => ({
    key: `theme-${mode}`,
    label: t(`theme.${mode}`),
    checked: themeMode === mode,
    ...(index === 0 ? { heading: t('theme.label') } : {}),
    onSelect: () => setThemeMode(mode),
  }));
  const signOut: MenuItem = { key: 'logout', label: t('logout'), icon: LogOut, heading: '', onSelect: () => void logout() };
  return [...languages, ...themes, signOut];
}

export function StaffProfileMenu({ variant }: StaffProfileMenuProps): ReactNode {
  const t = useT('layout');
  const profile = useStaffProfile();
  const items = useProfileItems();
  const isFull: boolean = variant === 'full';
  const trigger: ReactNode = (
    <>
      <Avatar initials={profile.initials} className="size-10 text-sm" />
      {isFull ? (
        <>
          <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
            <span title={profile.name} className="truncate text-sm font-semibold text-foreground">{profile.name}</span>
            <span className="truncate text-xs text-muted-foreground">{profile.subtitle}</span>
          </span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0" />
        </>
      ) : null}
    </>
  );
  return (
    <DropdownMenu
      label={t('profile.menu', { name: profile.name })}
      items={items}
      trigger={trigger}
      align={isFull ? 'start' : 'end'}
      width={isFull ? 232 : 248}
      className={cn('gap-2.5 p-1', isFull ? 'min-h-[52px] w-full justify-start px-2' : 'min-h-[44px] min-w-[44px] rounded-full')}
    />
  );
}
