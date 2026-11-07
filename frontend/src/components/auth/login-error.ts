export type LoginErrorKind = 'denied' | 'unavailable';

const UNAVAILABLE_CODES: ReadonlyArray<string> = ['server_error', 'temporarily_unavailable'];

export function parseLoginError(raw: string | ReadonlyArray<string> | undefined): LoginErrorKind | null {
  const code: string = (typeof raw === 'string' ? raw : (raw?.[0] ?? '')).trim().toLowerCase();
  if (code === '') return null;
  return UNAVAILABLE_CODES.includes(code) ? 'unavailable' : 'denied';
}
