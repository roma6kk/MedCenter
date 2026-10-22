import type { ReactNode } from 'react';

interface CodeChipProps {
  readonly code: string;
  readonly system?: string;
  readonly children?: ReactNode;
}

export function CodeChip({ code, system, children }: CodeChipProps): ReactNode {
  return (
    <code
      data-testid="code-chip"
      title={system}
      className="mono inline-block rounded-control border border-[var(--border)] bg-secondary px-1.5 py-0.5 text-xs"
    >
      {children ?? code}
    </code>
  );
}
