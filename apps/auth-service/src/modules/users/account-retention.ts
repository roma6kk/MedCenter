import { readRetentionAccountDays } from '../../config/auth-env';

export const ACCOUNT_RETENTION = Symbol('ACCOUNT_RETENTION');

const DAY_MS = 86_400_000;

export interface AccountRetention {
  readonly days: number;
  readonly now: () => Date;
}

export function accountRetentionFromEnv(source: NodeJS.ProcessEnv = process.env): AccountRetention {
  return { days: readRetentionAccountDays(source), now: () => new Date() };
}

export function closureOf(retention: AccountRetention): { readonly closedAt: Date; readonly retentionUntil: Date } {
  const closedAt = retention.now();
  return { closedAt, retentionUntil: new Date(closedAt.getTime() + retention.days * DAY_MS) };
}
