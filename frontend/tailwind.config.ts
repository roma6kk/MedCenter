import type { Config } from 'tailwindcss';

/**
 * Every value below points at a CSS variable of `src/styles/globals.css`, where the light and dark sets live. Tailwind 3
 * cannot add `/alpha` to a plain `var()` colour, so a colour that needs transparency gets its own token (`scrim`,
 * `*-soft`) instead of an opacity modifier.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        card: 'var(--card)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          strong: 'var(--primary-strong)',
          foreground: 'var(--primary-foreground)',
          soft: 'var(--primary-soft)',
          'soft-hover': 'var(--primary-soft-hover)',
          'soft-foreground': 'var(--primary-soft-foreground)',
        },
        secondary: 'var(--secondary)',
        accent: 'var(--accent)',
        destructive: {
          DEFAULT: 'var(--destructive)',
          hover: 'var(--destructive-hover)',
          foreground: 'var(--destructive-foreground)',
          soft: 'var(--destructive-soft)',
          'soft-hover': 'var(--destructive-soft-hover)',
        },
        warning: { DEFAULT: 'var(--warning)', foreground: 'var(--warning-foreground)', soft: 'var(--warning-soft)' },
        info: { DEFAULT: 'var(--info)', soft: 'var(--info-soft)' },
        success: { DEFAULT: 'var(--success)', foreground: 'var(--success-foreground)', soft: 'var(--success-soft)' },
        warm: { DEFAULT: 'var(--warm)', soft: 'var(--warm-soft)', foreground: 'var(--warm-foreground)' },
        inverse: {
          DEFAULT: 'var(--inverse)',
          foreground: 'var(--inverse-foreground)',
          muted: 'var(--inverse-muted)',
          border: 'var(--inverse-border)',
          accent: 'var(--inverse-accent)',
        },
        border: { DEFAULT: 'var(--border)', soft: 'var(--border-soft)' },
        input: 'var(--input)',
        ring: 'var(--ring)',
        scrim: 'var(--scrim)',
        glass: 'var(--glass)',
        muted: { foreground: 'var(--muted-foreground)' },
      },
      // Plain `rounded` is the small radius (badges, chips). `md` and `lg` stay out of the vocabulary on purpose.
      borderRadius: {
        DEFAULT: 'var(--radius-sm)',
        sm: 'var(--radius-sm)',
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
      },
      // The fluid scale of globals.css: `text-sm` and friends are steps, so no screen needs `text-[15px]`.
      // Line height shrinks as the size grows: body copy breathes, headlines stay tight.
      fontSize: {
        xs: ['var(--step--2)', { lineHeight: '1.4' }],
        sm: ['var(--step--1)', { lineHeight: '1.45' }],
        base: ['var(--step-0)', { lineHeight: '1.5' }],
        lg: ['var(--step-1)', { lineHeight: '1.4' }],
        xl: ['var(--step-2)', { lineHeight: '1.3' }],
        '2xl': ['var(--step-3)', { lineHeight: '1.25' }],
        '3xl': ['var(--step-4)', { lineHeight: '1.2' }],
        '4xl': ['var(--step-5)', { lineHeight: '1.12' }],
        '5xl': ['var(--step-6)', { lineHeight: '1.08' }],
      },
      boxShadow: {
        'elev-1': 'var(--shadow-1)',
        'elev-2': 'var(--shadow-2)',
        'elev-3': 'var(--shadow-3)',
        // Focus of a field: a soft halo next to the primary border (the thick outline stays for non-field elements).
        focus: '0 0 0 3px var(--focus-ring)',
        'focus-danger': '0 0 0 3px var(--focus-ring-danger)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
      // Entrances use the motion tokens; the global `prefers-reduced-motion` rule drops every animation, so each keyframe
      // only has a `from` state and the element simply appears in its final state.
      keyframes: {
        'scrim-in': { from: { opacity: '0' } },
        'dialog-in': { from: { opacity: '0', transform: 'scale(0.96)' } },
        'sheet-in': { from: { opacity: '0', transform: 'translateY(2rem)' } },
        'drawer-in': { from: { opacity: '0', transform: 'translateX(2rem)' } },
        'menu-in': { from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(1rem)' } },
        // A step of the booking wizard (and the slots of a newly chosen day) slides in a little and fades in.
        'step-in': { from: { opacity: '0', transform: 'translateY(0.5rem)' } },
        // The check mark of the success screen draws its stroke (the path is 24 long) and the disc behind it pops in.
        'check-draw': { from: { strokeDashoffset: '24' }, to: { strokeDashoffset: '0' } },
        'check-pop': { from: { opacity: '0', transform: 'scale(0.6)' } },
        // The unread counter of the bell swells once and sends a ring of its own colour outwards when a new one arrives.
        'badge-pulse': {
          '0%': { transform: 'scale(1)', boxShadow: '0 0 0 0 var(--destructive)' },
          '55%': { transform: 'scale(1.22)', boxShadow: '0 0 0 7px transparent' },
          '100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 transparent' },
        },
      },
      animation: {
        'scrim-in': 'scrim-in var(--duration-base) var(--ease-out)',
        'dialog-in': 'dialog-in var(--duration-base) var(--ease-out)',
        'sheet-in': 'sheet-in var(--duration-base) var(--ease-out)',
        'drawer-in': 'drawer-in var(--duration-base) var(--ease-out)',
        'menu-in': 'menu-in var(--duration-fast) var(--ease-out)',
        'toast-in': 'toast-in var(--duration-base) var(--ease-out)',
        'step-in': 'step-in var(--duration-base) var(--ease-out)',
        'check-draw': 'check-draw var(--duration-slow) var(--ease-out) 80ms both',
        'check-pop': 'check-pop var(--duration-base) var(--ease-out) both',
        'badge-pulse': 'badge-pulse 1.2s var(--ease-out) 2',
      },
      fontFamily: { sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
    },
  },
  plugins: [],
};

export default config;
