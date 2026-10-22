import type { ReactNode } from 'react';

/**
 * Decorative picture of the landing hero: a clinic card with a cross, an ECG trace and soft shapes, drawn only with
 * theme tokens so it follows the light and the dark set. It carries no information, hence `aria-hidden`.
 */
export function HeroIllustration(): ReactNode {
  return (
    <svg viewBox="0 0 520 420" aria-hidden="true" focusable="false" className="h-full w-full">
      <rect width="520" height="420" rx="24" fill="var(--primary-soft)" />
      <circle cx="430" cy="70" r="120" fill="var(--card)" opacity="0.55" />
      <circle cx="70" cy="360" r="90" fill="var(--card)" opacity="0.45" />
      <rect x="120" y="60" width="280" height="190" rx="20" fill="var(--card)" stroke="var(--border)" />
      <rect x="148" y="88" width="48" height="48" rx="14" fill="var(--primary)" />
      <path d="M172 100v24M160 112h24" stroke="var(--primary-foreground)" strokeWidth="5" strokeLinecap="round" />
      <rect x="212" y="94" width="120" height="10" rx="5" fill="var(--foreground)" opacity="0.85" />
      <rect x="212" y="116" width="84" height="8" rx="4" fill="var(--muted-foreground)" opacity="0.55" />
      <path
        d="M148 200h46l16-38 28 76 24-58 14 20h76"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="64" y="236" width="150" height="64" rx="16" fill="var(--card)" stroke="var(--border)" />
      <circle cx="96" cy="268" r="14" fill="var(--primary-soft)" />
      <rect x="120" y="258" width="74" height="8" rx="4" fill="var(--foreground)" opacity="0.8" />
      <rect x="120" y="274" width="50" height="7" rx="3.5" fill="var(--muted-foreground)" opacity="0.5" />
      <rect x="330" y="200" width="130" height="64" rx="16" fill="var(--primary)" />
      <path d="M358 232l10 10 20-22" fill="none" stroke="var(--primary-foreground)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="396" y="226" width="42" height="8" rx="4" fill="var(--primary-foreground)" opacity="0.85" />
    </svg>
  );
}
