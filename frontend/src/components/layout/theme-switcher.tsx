'use client';

import type { ReactNode } from 'react';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n/use-t';
import { THEME_MODES, type ThemeMode } from '@/lib/theme/theme';
import { useUiStore } from '@/store/use-ui-store';

const ICONS: Readonly<Record<ThemeMode, LucideIcon>> = { system: Monitor, light: Sun, dark: Moon };

const BUTTON_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-muted-foreground transition-colors duration-fast ease-out hover:bg-secondary aria-pressed:bg-primary-soft aria-pressed:text-primary-soft-foreground';

function nextMode(mode: ThemeMode): ThemeMode {
  return THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length] ?? 'system';
}

/**
 * Switch of the colour theme: system, light, dark. Icon-only, so every button is named by its `aria-label`.
 * `compact` collapses the three segments into one button that cycles the modes: the public and patient headers have no
 * room for three more 44 px targets without wrapping onto a second row.
 */
export function ThemeSwitcher({ compact = false }: { readonly compact?: boolean }): ReactNode {
  const t = useT('layout.theme');
  const mode = useUiStore((state) => state.themeMode);
  const setMode = useUiStore((state) => state.setThemeMode);
  if (compact) {
    const Icon = ICONS[mode];
    const label = t('cycle', { mode: t(mode) });
    return (
      <button type="button" aria-label={label} title={label} onClick={() => setMode(nextMode(mode))} className={BUTTON_CLASS}>
        <Icon aria-hidden="true" className="size-[18px]" />
      </button>
    );
  }
  return (
    <div className="flex gap-0.5" role="group" aria-label={t('label')}>
      {THEME_MODES.map((option) => {
        const Icon = ICONS[option];
        return (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            aria-label={t(option)}
            title={t(option)}
            onClick={() => setMode(option)}
            className={BUTTON_CLASS}
          >
            <Icon aria-hidden="true" className="size-[18px]" />
          </button>
        );
      })}
    </div>
  );
}
