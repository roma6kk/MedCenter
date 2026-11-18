export type QueryParamValue = string | number | boolean | null | undefined;
export type QueryParams = Readonly<Record<string, QueryParamValue>>;

const FORBIDDEN_KEYS: ReadonlyArray<string> = ['patient'];

export function buildQueryString(params: QueryParams = {}): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (FORBIDDEN_KEYS.includes(key)) throw new Error(`The "${key}" query parameter is derived from the token, never sent (ADR-013)`);
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const encoded = search.toString();
  return encoded === '' ? '' : `?${encoded}`;
}

export function withQuery(path: string, params?: QueryParams): string {
  return `${path}${buildQueryString(params)}`;
}
