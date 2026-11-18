import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClinicSettings1700000000005 implements MigrationInterface {
  public readonly name = 'ClinicSettings1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "auth"."clinic_settings" (
      "id" smallint PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
      "name" varchar(200) NOT NULL,
      "phone" varchar(30) NOT NULL,
      "email" varchar(255) NOT NULL,
      "address" varchar(300) NOT NULL,
      "hours" varchar(200) NOT NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      `INSERT INTO "auth"."clinic_settings" ("id", "name", "phone", "email", "address", "hours")
        VALUES (1, $1, $2, $3, $4, $5) ON CONFLICT ("id") DO NOTHING`,
      ['ООО «Лайфлайн»', '+375 17 000-00-00', 'info@lifeline.example', 'г. Минск, ул. Здоровья, 12', 'Пн–Пт 08:00–20:00, сб 09:00–15:00'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "auth"."clinic_settings"');
  }
}
