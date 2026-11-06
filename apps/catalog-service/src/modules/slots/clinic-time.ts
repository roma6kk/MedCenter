import { formatSlotPeriod } from '@medcenter/common';
import type { SlotResponseDto } from '@medcenter/fhir-mappers';

const STATUS_LABELS: Readonly<Record<SlotResponseDto['status'], string>> = {
  free: 'свободен',
  busy: 'занят',
  'entered-in-error': 'снят',
};

export function slotLabel(slot: Pick<SlotResponseDto, 'start' | 'end' | 'status'>): string {
  return `${formatSlotPeriod(slot.start, slot.end)} · ${STATUS_LABELS[slot.status]}`;
}
