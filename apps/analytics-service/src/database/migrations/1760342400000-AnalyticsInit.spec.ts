import type { QueryRunner } from 'typeorm';

import { AnalyticsInit1760342400000 } from './1760342400000-AnalyticsInit';

const ANALYTICS_TABLES: ReadonlyArray<string> = [
  'processed_event',
  'appointment_fact',
  'encounter_fact',
  'audit_event',
  'sync_cursor',
];

function makeQueryRunner(): { readonly query: jest.Mock } {
  return { query: jest.fn().mockResolvedValue(undefined) };
}

function statements(runner: { readonly query: jest.Mock }): ReadonlyArray<string> {
  return runner.query.mock.calls.map((call: ReadonlyArray<unknown>) => String(call[0]));
}

async function upStatements(): Promise<ReadonlyArray<string>> {
  const runner = makeQueryRunner();
  await new AnalyticsInit1760342400000().up(runner as unknown as QueryRunner);
  return statements(runner);
}

describe('AnalyticsInit1760342400000', () => {
  it('should carry a stable migration name when TypeORM records it', () => {
    expect(new AnalyticsInit1760342400000().name).toBe('AnalyticsInit1760342400000');
  });

  it('should create the analytics schema before any table when up() runs', async () => {
    const queries = await upStatements();

    expect(queries[0]).toBe('CREATE SCHEMA IF NOT EXISTS "analytics"');
  });

  it('should create exactly the five read-model tables when up() runs', async () => {
    const creates = (await upStatements()).filter((query) => query.startsWith('CREATE TABLE'));

    expect(creates).toHaveLength(ANALYTICS_TABLES.length);
    for (const table of ANALYTICS_TABLES) {
      expect(creates.some((query) => query.includes(`"analytics"."${table}"`))).toBe(true);
    }
  });

  it('should key the idempotency ledger by eventId when duplicates must conflict', async () => {
    const ledger = (await upStatements()).find((query) => query.includes('"analytics"."processed_event" ('));

    expect(ledger).toContain('"event_id" varchar(128) PRIMARY KEY');
  });

  it('should restrict the appointment status to the values the worker writes when the table is created', async () => {
    const facts = (await upStatements()).find((query) => query.includes('"analytics"."appointment_fact" ('));

    expect(facts).toContain(`CHECK ("status" IN ('booked', 'cancelled'))`);
  });

  it('should index every period column the reports and the journal filter on when the schema is built', async () => {
    const indexes = (await upStatements()).filter((query) => query.startsWith('CREATE INDEX'));

    expect(indexes.some((query) => query.includes('"appointment_fact" ("start_at")'))).toBe(true);
    expect(indexes.some((query) => query.includes('"encounter_fact" ("completed_at")'))).toBe(true);
    expect(indexes.some((query) => query.includes('"audit_event" ("occurred_at" DESC, "id" DESC)'))).toBe(true);
  });

  it('should qualify every statement with the analytics schema when migrating, so nothing lands in public', async () => {
    const queries = await upStatements();

    expect(queries.every((query) => query.includes('"analytics"'))).toBe(true);
  });

  it('should drop the tables but keep the schema when down() runs, because the migrations table lives there', async () => {
    const runner = makeQueryRunner();

    await new AnalyticsInit1760342400000().down(runner as unknown as QueryRunner);

    const queries = statements(runner);
    expect(queries.filter((query) => query.startsWith('DROP TABLE'))).toHaveLength(ANALYTICS_TABLES.length);
    expect(queries.some((query) => query.startsWith('DROP SCHEMA'))).toBe(false);
  });
});
