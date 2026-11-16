import type { DataSource } from 'typeorm';

export interface ClinicDetails {
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly address: string;
  readonly hours: string;
}

export const CLINIC_STORE = Symbol('CLINIC_STORE');

export interface ClinicStore {
  get(): Promise<ClinicDetails>;
  update(changes: Partial<ClinicDetails>): Promise<ClinicDetails>;
}

export const CLINIC_FIELDS = ['name', 'phone', 'email', 'address', 'hours'] as const;

const TABLE = '"auth"."clinic_settings"';

export class TypeOrmClinicStore implements ClinicStore {
  constructor(private readonly dataSource: DataSource) {}

  async get(): Promise<ClinicDetails> {
    const rows: ClinicDetails[] = await this.dataSource.query(
      `SELECT "name", "phone", "email", "address", "hours" FROM ${TABLE} WHERE "id" = 1`,
    );
    return rows[0] as ClinicDetails;
  }

  async update(changes: Partial<ClinicDetails>): Promise<ClinicDetails> {
    const fields = CLINIC_FIELDS.filter((field) => changes[field] !== undefined);
    if (fields.length > 0) {
      const assignments = fields.map((field, index) => `"${field}" = $${index + 1}`);
      await this.dataSource.query(
        `UPDATE ${TABLE} SET ${assignments.join(', ')}, "updated_at" = now() WHERE "id" = 1`,
        fields.map((field) => changes[field]),
      );
    }
    return this.get();
  }
}
