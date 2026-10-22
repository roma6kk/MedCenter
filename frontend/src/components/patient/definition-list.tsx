import type { ReactNode } from 'react';
import { WRAP_TEXT } from './wrap-text';

/** A bordered term list: label on the left, value on the right from `sm` up, stacked on a phone. */
export function DefinitionList({ children }: { readonly children: ReactNode }): ReactNode {
  return <dl className="rounded-card border border-border bg-card px-5">{children}</dl>;
}

export function DefinitionRow({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className="border-t border-border py-3.5 first:border-t-0 sm:grid sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-sm sm:mt-0 ${WRAP_TEXT}`}>{children}</dd>
    </div>
  );
}
