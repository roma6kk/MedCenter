'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { sectionDomId, type SectionId } from './encounter-sections';

interface FormSectionProps {
  readonly id: SectionId;
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
}

export function FormSection({ id, title, hint, children }: FormSectionProps): ReactNode {
  const titleId = `${sectionDomId(id)}-title`;
  return (
    <Card as="section" id={sectionDomId(id)} aria-labelledby={titleId} className="scroll-mt-48 lg:scroll-mt-24">
      <h2 id={titleId} tabIndex={-1} className="text-lg font-bold focus:outline-none">{title}</h2>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </Card>
  );
}
