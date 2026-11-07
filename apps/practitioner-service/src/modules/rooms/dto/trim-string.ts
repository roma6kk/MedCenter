export function trimString({ value }: { readonly value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
