import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AppointmentBookedEvent, AppointmentCancelledEvent, EncounterCompletedEvent } from '@medcenter/contracts';

import { diagnosisCountOf, type AnalyticsEvent } from './analytics-event';
import { READ_MODEL_WRITER, type ApplyOutcome, type EventMeta, type ReadModelWriter } from './read-model.writer';
import { SpecialtyResolver, UNKNOWN_SPECIALTY, type Specialty } from './specialty.resolver';

const SPECIALTY_CODE_MAX = 128;
const SPECIALTY_DISPLAY_MAX = 255;

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

interface IngestOptions {
  readonly isLastAttempt?: boolean;
}

function metaOf(event: AnalyticsEvent): EventMeta {
  return { eventId: event.eventId, eventType: event.type, occurredAt: new Date(event.occurredAt) };
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @Inject(READ_MODEL_WRITER) private readonly writer: ReadModelWriter,
    private readonly specialties: SpecialtyResolver,
  ) {}

  ingest(event: AnalyticsEvent, options: IngestOptions = {}): Promise<ApplyOutcome> {
    switch (event.type) {
      case 'appointment.booked.v1':
        return this.ingestBooked(event);
      case 'appointment.cancelled.v1':
        return this.ingestCancelled(event);
      case 'encounter.completed.v1':
        return this.ingestCompleted(event, options.isLastAttempt === true);
    }
  }

  private ingestBooked(event: AppointmentBookedEvent): Promise<ApplyOutcome> {
    return this.writer.applyBooked(metaOf(event), {
      appointmentId: event.appointmentId,
      patientRef: event.patientRef,
      practitionerRoleRef: event.practitionerRoleRef,
      serviceId: event.serviceId,
      slotRef: event.slotRef,
      startAt: new Date(event.start),
      bookedAt: new Date(event.occurredAt),
    });
  }

  private ingestCancelled(event: AppointmentCancelledEvent): Promise<ApplyOutcome> {
    return this.writer.applyCancelled(metaOf(event), {
      appointmentId: event.appointmentId,
      patientRef: event.patientRef,
      cancelledAt: new Date(event.occurredAt),
      actorType: event.actorType,
    });
  }

  // The pre-check only spares HAPI a lookup; the transactional claim in the writer still decides.
  private async ingestCompleted(event: EncounterCompletedEvent, isLastAttempt: boolean): Promise<ApplyOutcome> {
    if (await this.writer.isProcessed(event.eventId)) {
      return 'duplicate';
    }
    const specialty = await this.specialtyOf(event, isLastAttempt);
    return this.writer.applyEncounterCompleted(metaOf(event), {
      encounterId: event.encounterId,
      patientRef: event.patientRef,
      practitionerRef: event.practitionerRef,
      specialtySystem: specialty.system === null ? null : clip(specialty.system, SPECIALTY_DISPLAY_MAX),
      specialtyCode: clip(specialty.code, SPECIALTY_CODE_MAX),
      specialtyDisplay: specialty.display === null ? null : clip(specialty.display, SPECIALTY_DISPLAY_MAX),
      completedAt: new Date(event.occurredAt),
      diagnosisCount: diagnosisCountOf(event),
    });
  }

  // On the last attempt a HAPI failure files the encounter under unknown instead of dead-lettering it, so an outage cannot drop it from the report.
  private async specialtyOf(event: EncounterCompletedEvent, isLastAttempt: boolean): Promise<Specialty> {
    try {
      return await this.specialties.resolve(event.practitionerRef);
    } catch (error) {
      if (!isLastAttempt) {
        throw error;
      }
      this.logger.error(
        { err: error, eventId: event.eventId, encounterId: event.encounterId, practitionerRef: event.practitionerRef },
        'specialty unresolved on the last attempt; filing the encounter under "unknown"',
      );
      return UNKNOWN_SPECIALTY;
    }
  }
}
