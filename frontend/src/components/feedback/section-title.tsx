import type { ReactNode } from 'react';

interface SectionTitleProps {
  readonly children: ReactNode;
}

export function SectionTitle({ children }: SectionTitleProps): ReactNode {
  return <h2 className="serif text-xl font-semibold">{children}</h2>;
}
