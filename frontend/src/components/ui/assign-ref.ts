import type { ForwardedRef } from 'react';

export function assignRef<T>(ref: ForwardedRef<T>, node: T): void {
  if (typeof ref === 'function') ref(node);
  else if (ref !== null) ref.current = node;
}
