/** appointment-fixtures — a realistic `AppointmentViewDto` for the specs of the cabinet (never imported by application code). */
import type { AppointmentView } from './appointment-types';

export function appointmentFixture(overrides: Partial<AppointmentView> = {}): AppointmentView {
  return {
    id: '1552',
    status: 'booked',
    start: '2026-10-19T07:00:00.000Z',
    end: '2026-10-19T07:30:00.000Z',
    slotId: 'slot-1',
    patientId: '1442',
    doctorId: 'doctor-1',
    practitionerRoleId: 'role-1',
    serviceId: 'service-1',
    createdAt: '2026-10-15',
    doctorName: 'Иванова Мария Сергеевна',
    serviceName: 'Приём терапевта (первичный)',
    patientName: 'Лебедева Анна',
    ...overrides,
  };
}
