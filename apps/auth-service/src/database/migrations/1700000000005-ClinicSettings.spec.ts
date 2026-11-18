import type { QueryRunner } from 'typeorm';

import { ClinicSettings1700000000005 } from './1700000000005-ClinicSettings';

function recorder(): { runner: QueryRunner; calls: Array<{ sql: string; parameters: ReadonlyArray<unknown> }> } {
  const calls: Array<{ sql: string; parameters: ReadonlyArray<unknown> }> = [];
  const query = jest.fn().mockImplementation(async (sql: string, parameters: ReadonlyArray<unknown> = []) => {
    calls.push({ sql, parameters });
  });
  return { runner: { query } as unknown as QueryRunner, calls };
}

describe('ClinicSettings1700000000005', () => {
  const migration = new ClinicSettings1700000000005();

  it('should carry a stable migration name', () => {
    expect(migration.name).toBe('ClinicSettings1700000000005');
  });

  it('should create a table that can hold one row only when up() runs', async () => {
    const { runner, calls } = recorder();

    await migration.up(runner);

    expect(calls[0]?.sql).toContain('CREATE TABLE IF NOT EXISTS "auth"."clinic_settings"');
    expect(calls[0]?.sql).toContain('CHECK ("id" = 1)');
  });

  it('should seed the details the landing page showed before the table existed', async () => {
    const { runner, calls } = recorder();

    await migration.up(runner);

    expect(calls[1]?.sql).toContain('ON CONFLICT ("id") DO NOTHING');
    expect(calls[1]?.parameters).toEqual([
      'ООО «Лайфлайн»',
      '+375 17 000-00-00',
      'info@lifeline.example',
      'г. Минск, ул. Здоровья, 12',
      'Пн–Пт 08:00–20:00, сб 09:00–15:00',
    ]);
  });

  it('should drop the table when down() runs', async () => {
    const { runner, calls } = recorder();

    await migration.down(runner);

    expect(calls[0]?.sql).toContain('DROP TABLE IF EXISTS "auth"."clinic_settings"');
  });
});
