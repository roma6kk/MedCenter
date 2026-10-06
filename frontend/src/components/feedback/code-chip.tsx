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
      className="mono inline-block rounded-[6px] border border-[var(--border)] bg-[#F3F1EA] px-1.5 py-0.5 text-xs"
    >
      {children ?? code}
    </code>
  );
}
