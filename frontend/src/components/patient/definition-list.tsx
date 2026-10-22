import type { ReactNode } from 'react';
import { WRAP_TEXT } from './wrap-text';

/** A bordered term list: label and value side by side when the container is wide enough, stacked when it is narrow (a phone, a side column). */
export function DefinitionList({ children }: { readonly children: ReactNode }): ReactNode {
  return <dl className="rounded-card border border-border bg-card px-5">{children}</dl>;
}

export function DefinitionRow({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border py-3.5 first:border-t-0">
      <dt className="w-48 flex-none text-[13px] text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 flex-[1_1_14rem] text-sm ${WRAP_TEXT}`}>{children}</dd>
    </div>
  );
}
