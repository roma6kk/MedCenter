import type { FhirResource } from '@medcenter/fhir';

/** `entered-in-error` is a slot retired by a schedule removal; it shows only when an admin asks for that status. */
export interface SlotResponseDto {
  readonly id: string;
  readonly scheduleId: string;
  readonly start: string;
  readonly end: string;
  readonly status: 'free' | 'busy' | 'entered-in-error';
}

function readReferenceId(resource: FhirResource, key: string): string {
  const value = resource[key];
  if (typeof value !== 'object' || value === null) {
    return '';
  }
  const { reference } = value as { reference?: unknown };
  return typeof reference === 'string' ? reference.split('/').pop() ?? '' : '';
}

function toSlotStatus(status: unknown): SlotResponseDto['status'] {
  if (status === 'entered-in-error') {
    return 'entered-in-error';
  }
  return status === 'busy' ? 'busy' : 'free';
}

export function toSlotResponseDto(slot: FhirResource): SlotResponseDto {
  return {
    id: slot.id ?? '',
    scheduleId: readReferenceId(slot, 'schedule'),
    start: typeof slot['start'] === 'string' ? slot['start'] : '',
    end: typeof slot['end'] === 'string' ? slot['end'] : '',
    status: toSlotStatus(slot['status']),
  };
}

