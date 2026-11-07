import { Inject, Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ANALYTICS_DATA_SOURCE } from '../../database/database.tokens';
import { AppointmentFactEntity } from '../../database/entities/appointment-fact.entity';
import { EncounterFactEntity } from '../../database/entities/encounter-fact.entity';
import type { DateRange } from '../shared/date-range';

export type SqlCount = string | number;

export interface StatusCountRow {
  readonly status: string;
  readonly count: SqlCount;
}

interface SpecialtyCountRow {
  readonly system: string | null;
  readonly code: string;
  readonly display: string | null;
  readonly count: SqlCount;
}

interface ServiceCountRow {
  readonly serviceId: string;
  readonly count: SqlCount;
}

export interface ReportsRepository {
  countAppointmentsByStatus(
    range: DateRange,
    noShowIds: ReadonlyArray<string>,
    fulfilledIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<StatusCountRow>>;
  countEncountersBySpecialty(range: DateRange): Promise<ReadonlyArray<SpecialtyCountRow>>;
  countBookingsByService(range: DateRange, limit: number): Promise<ReadonlyArray<ServiceCountRow>>;
}

export const REPORTS_REPOSITORY = Symbol('REPORTS_REPOSITORY');

// noshow/fulfilled exist only in HAPI: a still-booked fact listed there is reclassified. Ids are one array parameter, not an IN list.
const COUNT_APPOINTMENTS_BY_STATUS = `SELECT
    CASE
      WHEN "status" = 'booked' AND "appointment_id" = ANY($3::varchar[]) THEN 'noshow'
      WHEN "status" = 'booked' AND "appointment_id" = ANY($4::varchar[]) THEN 'fulfilled'
      ELSE "status"
    END AS "status",
    COUNT(*) AS "count"
  FROM "analytics"."appointment_fact"
  WHERE "start_at" >= $1 AND "start_at" < $2
  GROUP BY 1`;

@Injectable()
export class TypeOrmReportsRepository implements ReportsRepository {
  constructor(@Inject(ANALYTICS_DATA_SOURCE) private readonly dataSource: DataSource) {}

  async countAppointmentsByStatus(
    range: DateRange,
    noShowIds: ReadonlyArray<string>,
    fulfilledIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<StatusCountRow>> {
    return this.dataSource.query(COUNT_APPOINTMENTS_BY_STATUS, [range.from, range.toExclusive, [...noShowIds], [...fulfilledIds]]);
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
