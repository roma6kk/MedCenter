import { toSlotResponseDto } from './slot.mapper';

describe('toSlotResponseDto', () => {
  it('should map a FHIR Slot to a free response DTO', () => {
    const dto = toSlotResponseDto({
      resourceType: 'Slot',
      id: 'slot-1',
      schedule: { reference: 'Schedule/sched-9' },
      start: '2026-11-01T09:00:00+03:00',
      end: '2026-11-01T09:30:00+03:00',
      status: 'free',
    });

    expect(dto).toEqual({
      id: 'slot-1',
      scheduleId: 'sched-9',
      start: '2026-11-01T09:00:00+03:00',
      end: '2026-11-01T09:30:00+03:00',
      status: 'free',
    });
  });

  it('should map a busy slot status through unchanged', () => {
    const dto = toSlotResponseDto({
      resourceType: 'Slot',
      id: 'slot-2',
      schedule: { reference: 'Schedule/sched-9' },
      status: 'busy',
    });

    expect(dto.status).toBe('busy');
  });

  it('should keep entered-in-error apart from free when a slot was retired by a schedule removal', () => {
    const dto = toSlotResponseDto({
      resourceType: 'Slot',
      id: 'slot-3',
      schedule: { reference: 'Schedule/sched-9' },
      status: 'entered-in-error',
    });

    expect(dto.status).toBe('entered-in-error');
  });

  it('should default missing fields to empty strings', () => {
    const dto = toSlotResponseDto({ resourceType: 'Slot' });

    expect(dto).toEqual({
      id: '',
      scheduleId: '',
      start: '',
      end: '',
      status: 'free',
    });
  });
});
