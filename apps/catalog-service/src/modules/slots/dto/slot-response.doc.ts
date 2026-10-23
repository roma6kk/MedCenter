import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SlotResponseDto } from '@medcenter/fhir-mappers';

import { PageMetaDoc } from '../../../common/page-meta.doc';
import type {
  DoctorScheduleResponseDto,
  DoctorScheduleSlotDto,
  ScheduleSummaryDto,
  WeeklyWindowView,
} from './doctor-schedule-response.dto';
import type { DoctorSlotsResponseDto } from './doctor-slots-response.dto';

/** Documentation class of `SlotResponseDto` (API §5.2.8). */
export class SlotResponseDoc implements SlotResponseDto {
  @ApiProperty({ description: 'Slot id (deterministic sha256)', example: '3f2a9c0d' })
  id!: string;

  @ApiProperty({ description: 'Schedule id (FHIR id)', example: '2001' })
  scheduleId!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-02T06:00:00.000Z' })
  start!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-02T06:30:00.000Z' })
  end!: string;

  @ApiProperty({ enum: ['free', 'busy', 'entered-in-error'], enumName: 'SlotStatus' })
  status!: 'free' | 'busy' | 'entered-in-error';
}

/** Documentation class of `WeeklyWindowView`: one weekly window in clinic time. */
export class WeeklyWindowViewDoc implements WeeklyWindowView {
  @ApiProperty({ enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] })
  dayOfWeek!: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

  @ApiProperty({ example: '09:00' })
  startTime!: string;

  @ApiProperty({ example: '13:00' })
  endTime!: string;
}

/** Documentation class of `ScheduleSummaryDto`. */
export class ScheduleSummaryDoc implements ScheduleSummaryDto {
  @ApiProperty({ description: 'Schedule id (FHIR id)', example: '2001' })
  id!: string;

  @ApiProperty({ description: 'false for a deactivated schedule (API §5.2.4)' })
  isActive!: boolean;

  @ApiPropertyOptional({ description: 'PractitionerRole id', example: '1042' })
  practitionerRoleId?: string;

  @ApiPropertyOptional({ description: 'Location (room) id', example: '1043' })
  roomId?: string;

  @ApiPropertyOptional({ description: 'HealthcareService id', example: '1044' })
  serviceId?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-11-02' })
  horizonFrom?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-12-31' })
  horizonTo?: string;

  @ApiPropertyOptional({ example: 30 })
  slotDurationMin?: number;

  @ApiProperty({ type: [WeeklyWindowViewDoc] })
  windows!: WeeklyWindowViewDoc[];

  @ApiPropertyOptional()
  comment?: string;
}

/** `PaginatedResponseDto<ScheduleSummaryDto>` (API §0, §5.2.2). */
export class SchedulePageDoc {
  @ApiProperty({ type: [ScheduleSummaryDoc] })
  items!: ScheduleSummaryDoc[];

  @ApiProperty({ type: PageMetaDoc })
  meta!: PageMetaDoc;
}

/** Documentation class of `DoctorScheduleSlotDto`: a slot plus a clinic-time label. */
export class DoctorScheduleSlotDoc extends SlotResponseDoc implements DoctorScheduleSlotDto {
  @ApiProperty({
    description: 'Ready-to-render clinic-time label',
    example: '02.11.2026 12:00–12:30 · занят',
  })
  label!: string;
}

/** Documentation class of `DoctorScheduleResponseDto` (API §5.2.7). */
export class DoctorScheduleResponseDoc implements DoctorScheduleResponseDto {
  @ApiProperty({ description: 'PractitionerRole id of the signed-in doctor', example: '1042' })
  practitionerRoleId!: string;

  @ApiProperty({ example: '2026-11-02T00:00:00.000Z' })
  from!: string;

  @ApiProperty({ example: '2026-11-09T00:00:00.000Z' })
  to!: string;

  @ApiProperty({ type: [ScheduleSummaryDoc] })
  schedules!: ScheduleSummaryDoc[];

  @ApiProperty({
    type: [DoctorScheduleSlotDoc],
    description: 'Free and busy slots, sorted by start',
  })
  items!: DoctorScheduleSlotDoc[];

  @ApiPropertyOptional({
    type: Boolean,
    enum: [true],
    description: 'Only when the slot search hit its page cap: later slots may be missing',
  })
  truncated?: true;
}

/** Documentation class of `DoctorSlotsResponseDto` (API §5.2.8). */
export class DoctorSlotsResponseDoc implements DoctorSlotsResponseDto {
  @ApiProperty({ description: 'Practitioner id', example: '1042' })
  doctorId!: string;

  @ApiProperty({ example: '2026-11-02T00:00:00.000Z' })
  from!: string;

  @ApiProperty({ example: '2026-11-09T00:00:00.000Z' })
  to!: string;

  @ApiProperty({
    type: [SlotResponseDoc],
    description: 'Free slots, sorted by start; no pagination',
  })
  items!: SlotResponseDoc[];

  @ApiPropertyOptional({
    type: Boolean,
    enum: [true],
    description: 'Only when the slot search hit its page cap: later days may be missing',
  })
  truncated?: true;
}
