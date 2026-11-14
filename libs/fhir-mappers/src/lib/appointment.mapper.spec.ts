import { toAppointmentResponseDto } from './appointment.mapper';

const SYSTEM = 'urn:medcenter:appointment-cancel-reason';

describe('toAppointmentResponseDto cancelReason', () => {
  it('should read the code of the local cancellation reason system', () => {
    const dto = toAppointmentResponseDto({
      resourceType: 'Appointment',
      id: 'a-1',
      status: 'cancelled',
      cancelationReason: { coding: [{ system: SYSTEM, code: 'inconvenient-time' }] },
    });

    expect(dto.cancelReason).toBe('inconvenient-time');
  });

  it.each([
    ['legacy free text', { text: 'Заболел, не смогу прийти' }],
    ['an unknown code', { coding: [{ system: SYSTEM, code: 'illness' }] }],
    ['a code of another system', { coding: [{ system: 'urn:other', code: 'plans-changed' }] }],
  ])('should read %s as other and never pass the text on', (_name, cancelationReason) => {
    const dto = toAppointmentResponseDto({ resourceType: 'Appointment', id: 'a-1', status: 'cancelled', cancelationReason });

    expect(dto.cancelReason).toBe('other');
    expect(JSON.stringify(dto)).not.toContain('Заболел');
  });

  it('should leave cancelReason out when the appointment has none, and never expose the legacy reasonCode text', () => {
    const dto = toAppointmentResponseDto({ resourceType: 'Appointment', id: 'a-1', status: 'booked', reasonCode: [{ text: 'Болит спина' }] });

    expect(dto.cancelReason).toBeUndefined();
    expect(JSON.stringify(dto)).not.toContain('Болит');
  });
});
