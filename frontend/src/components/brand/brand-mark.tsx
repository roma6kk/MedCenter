import type { ReactNode } from 'react';

const LEAF_PATH = 'M0 -34 C30 -58 34 -118 0 -176 C-34 -118 -30 -58 0 -34 Z';
const OUTER_ANGLES: readonly number[] = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const INNER_ANGLES: readonly number[] = OUTER_ANGLES.map((angle) => angle + 15);

interface BrandMarkProps {
  /** Side of the square the mark is drawn in, px. */
  readonly size?: number;
}

/**
 * The Lifeline rosette: a ring of twelve leaves with a lighter ring between them and a sprout in the middle. One mark for every
 * header (public, patient, staff, sign-in), painted from the theme tokens so the dark theme recolours it. Decorative, the word next
 * to it names the clinic.
 */
export function BrandMark({ size = 36 }: BrandMarkProps): ReactNode {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 640 640" className="shrink-0">
      <circle cx="320" cy="320" r="290" strokeWidth={14} className="fill-primary-soft stroke-primary" />
      <g transform="translate(320 320)">
        {OUTER_ANGLES.map((angle) => (
          <path key={angle} d={LEAF_PATH} transform={`rotate(${angle}) scale(1.45)`} className="fill-primary" />
        ))}
        {INNER_ANGLES.map((angle) => (
          <path key={angle} d={LEAF_PATH} transform={`rotate(${angle}) scale(0.9)`} strokeWidth={6} className="fill-primary-soft stroke-primary" />
        ))}
        <circle r="56" strokeWidth={12} className="fill-card stroke-primary" />
        <path d="M0 26 V6" fill="none" strokeWidth={9} strokeLinecap="round" className="stroke-primary" />
        <path d="M0 0 C13 -8 16 -26 0 -34 C-16 -26 -13 -8 0 0 Z" transform="translate(0 8) rotate(-40) scale(1)" className="fill-primary" />
        <path d="M0 0 C13 -8 16 -26 0 -34 C-16 -26 -13 -8 0 0 Z" transform="translate(0 8) rotate(40) scale(1)" className="fill-primary" />
      </g>
    </svg>
  );
}
