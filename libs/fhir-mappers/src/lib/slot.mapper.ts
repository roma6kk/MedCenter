import type { FhirResource } from '@medcenter/fhir';

/**
 * Response DTO for `GET /api/v1/doctors/{id}/slots` (API §5.2.8).
 * `status` is narrowed to the only two values the catalog read side exposes.
 */
export interface SlotResponseDto {
  readonly id: string;
  readonly scheduleId: string;
  readonly start: string;
  readonly end: string;
  readonly status: 'free' | 'busy';
}

function readReferenceId(resource: FhirResource, key: string): string {
  const value = resource[key];
  if (typeof value !== 'object' || value === null) {
    return '';
  }
  const { reference } = value as { reference?: unknown };
  return typeof reference === 'string' ? reference.split('/').pop() ?? '' : '';
}

/** FHIR `Slot` -> `SlotResponseDto` (ADR-002 mapper pair). */
export function toSlotResponseDto(slot: FhirResource): SlotResponseDto {
  return {
    id: slot.id ?? '',
    scheduleId: readReferenceId(slot, 'schedule'),
    start: typeof slot['start'] === 'string' ? slot['start'] : '',
    end: typeof slot['end'] === 'string' ? slot['end'] : '',
    status: slot['status'] === 'busy' ? 'busy' : 'free',
  };
}

