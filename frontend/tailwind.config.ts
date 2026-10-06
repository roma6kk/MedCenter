import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        card: 'var(--card)',
        foreground: 'var(--foreground)',
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: 'var(--secondary)',
        accent: 'var(--accent)',
        destructive: 'var(--destructive)',
        warning: 'var(--warning)',
        success: 'var(--success)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        muted: { foreground: 'var(--muted-foreground)' },
      },
      borderRadius: { DEFAULT: 'var(--radius)' },
    },
  },
  plugins: [],
};

export default config;
