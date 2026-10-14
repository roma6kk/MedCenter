import { Inject, Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ANALYTICS_DATA_SOURCE } from '../../database/database.tokens';
import { AppointmentFactEntity } from '../../database/entities/appointment-fact.entity';
import { EncounterFactEntity } from '../../database/entities/encounter-fact.entity';
import type { DateRange } from '../shared/date-range';

/** PostgreSQL returns `COUNT(*)` as a string (bigint); the service normalises it. */
export type SqlCount = string | number;

export interface StatusCountRow {
  readonly status: string;
  readonly count: SqlCount;
}

export interface SpecialtyCountRow {
  readonly system: string | null;
  readonly code: string;
  readonly display: string | null;
  readonly count: SqlCount;
}

export interface ServiceCountRow {
  readonly serviceId: string;
  readonly count: SqlCount;
}

/** Read side of the analytics read-model (API §9.1–9.3). */
export interface ReportsRepository {
  /**
   * Appointments starting in the period, by status. `noShowIds` are the HAPI
   * `Appointment`s with status `noshow`: those the read-model still holds as
   * `booked` are reported as `noshow` instead, in the same statement, so the
   * three counts describe one population and always partition it.
   */
  countAppointmentsByStatus(range: DateRange, noShowIds: ReadonlyArray<string>): Promise<ReadonlyArray<StatusCountRow>>;
  countEncountersBySpecialty(range: DateRange): Promise<ReadonlyArray<SpecialtyCountRow>>;
  countBookingsByService(range: DateRange, limit: number): Promise<ReadonlyArray<ServiceCountRow>>;
}

export const REPORTS_REPOSITORY = Symbol('REPORTS_REPOSITORY');

/**
 * `noshow` exists only in HAPI (no domain event announces it), so the status is
 * derived here: a still-`booked` fact whose id HAPI lists as no-show. `$3` is
 * one array parameter, not an `IN (...)` list, so the count of ids is unbounded.
 */
const COUNT_APPOINTMENTS_BY_STATUS = `SELECT
    CASE WHEN "status" = 'booked' AND "appointment_id" = ANY($3::varchar[]) THEN 'noshow' ELSE "status" END AS "status",
    COUNT(*) AS "count"
  FROM "analytics"."appointment_fact"
  WHERE "start_at" >= $1 AND "start_at" < $2
  GROUP BY 1`;

/** Parameterised aggregates over the `analytics` schema. */
@Injectable()
export class TypeOrmReportsRepository implements ReportsRepository {
  constructor(@Inject(ANALYTICS_DATA_SOURCE) private readonly dataSource: DataSource) {}

  async countAppointmentsByStatus(range: DateRange, noShowIds: ReadonlyArray<string>): Promise<ReadonlyArray<StatusCountRow>> {
    const rows: ReadonlyArray<StatusCountRow> = await this.dataSource.query(COUNT_APPOINTMENTS_BY_STATUS, [
      range.from,
      range.toExclusive,
      [...noShowIds],
    ]);
    return rows;
  }

  countEncountersBySpecialty(range: DateRange): Promise<ReadonlyArray<SpecialtyCountRow>> {
    return this.dataSource
      .getRepository(EncounterFactEntity)
      .createQueryBuilder('fact')
      .select('fact.specialtySystem', 'system')
      .addSelect('fact.specialtyCode', 'code')
      .addSelect('MAX(fact.specialtyDisplay)', 'display')
      .addSelect('COUNT(*)', 'count')
      .where('fact.completedAt >= :from AND fact.completedAt < :toExclusive', range)
      .groupBy('fact.specialtySystem')
      .addGroupBy('fact.specialtyCode')
      .orderBy('count', 'DESC')
      .addOrderBy('code', 'ASC')
      .addOrderBy('system', 'ASC', 'NULLS FIRST')
      .getRawMany<SpecialtyCountRow>();
  }

  countBookingsByService(range: DateRange, limit: number): Promise<ReadonlyArray<ServiceCountRow>> {
    return this.dataSource
      .getRepository(AppointmentFactEntity)
      .createQueryBuilder('fact')
      .select('fact.serviceId', 'serviceId')
      .addSelect('COUNT(*)', 'count')
      .where('fact.startAt >= :from AND fact.startAt < :toExclusive', range)
      .andWhere('fact.status <> :cancelled', { cancelled: 'cancelled' })
      .andWhere('fact.serviceId IS NOT NULL')
      .groupBy('fact.serviceId')
      .orderBy('count', 'DESC')
      .addOrderBy('"serviceId"', 'ASC')
      .limit(limit)
      .getRawMany<ServiceCountRow>();
  }
}
