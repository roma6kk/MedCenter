import type { ReactNode } from 'react';

/** `pathLength="1"` normalises the dash; the global reduced-motion rule drops the animation. */
export function HeroEcg(): ReactNode {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 320 40" className="h-10 w-full max-w-[20rem] text-primary" fill="none">
      <path
        d="M0 24 H78 q7 -9 14 0 H108 l5 5 l8 -24 l8 33 l6 -14 H160 q11 -13 24 0 H320"
        pathLength={1}
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={1}
        className="animate-ecg-draw"
      />
    </svg>
  );
}
