'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { sectionDomId, type SectionId } from './encounter-sections';

interface FormSectionProps {
  readonly id: SectionId;
  readonly title: string;
  /** One quiet line under the title (what the section needs). */
  readonly hint?: string;
  readonly children: ReactNode;
}

/**
 * A section of the completion form as a card of the interface (A9), not a browser `fieldset`: a heading, an optional hint and
 * the content. The card is the anchor of the section navigator, so it keeps clear of the sticky patient bar when scrolled to;
 * its heading can take focus (`tabIndex -1`) so a jump from the navigator is announced.
 */
export function FormSection({ id, title, hint, children }: FormSectionProps): ReactNode {
  const titleId = `${sectionDomId(id)}-title`;
  return (
    <Card as="section" id={sectionDomId(id)} aria-labelledby={titleId} className="scroll-mt-32 lg:scroll-mt-24">
      <h2 id={titleId} tabIndex={-1} className="text-lg font-bold focus:outline-none">{title}</h2>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </Card>
  );
}
