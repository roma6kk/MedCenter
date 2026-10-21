import type { Config } from 'tailwindcss';

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
          foreground: 'var(--primary-foreground)',
          soft: 'var(--primary-soft)',
          'soft-foreground': 'var(--primary-soft-foreground)',
        },
        secondary: 'var(--secondary)',
        accent: 'var(--accent)',
        destructive: { DEFAULT: 'var(--destructive)', soft: 'var(--destructive-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        inverse: {
          DEFAULT: 'var(--inverse)',
          foreground: 'var(--inverse-foreground)',
          muted: 'var(--inverse-muted)',
          border: 'var(--inverse-border)',
          accent: 'var(--inverse-accent)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        muted: { foreground: 'var(--muted-foreground)' },
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
      },
      fontFamily: { sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
    },
  },
  plugins: [],
};

export default config;
