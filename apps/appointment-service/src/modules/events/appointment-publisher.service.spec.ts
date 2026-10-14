import { Logger } from '@nestjs/common';
import type { DomainEvent, EventPublisher } from '@medcenter/messaging';

import { AppointmentPublisherService } from './appointment-publisher.service';

const BOOKED = {
  appointmentId: 'apt-1',
  patientRef: 'Patient/pat-1',
  practitionerRoleRef: 'PractitionerRole/role-1',
  slotRef: 'Slot/slot-1',
  start: '2026-11-02T09:00:00+03:00',
  serviceId: 'svc-1',
} as const;

const CANCELLED = { appointmentId: 'apt-1', patientRef: 'Patient/pat-1', reason: 'не смогу прийти', actorType: 'PATIENT' } as const;

describe('AppointmentPublisherService', () => {
  let publish: jest.MockedFunction<EventPublisher['publish']>;
  let service: AppointmentPublisherService;
  let logged: jest.SpyInstance;

  const publishedEvent = (): DomainEvent => {
    const event = publish.mock.calls[0]?.[0];
    if (event === undefined) {
      throw new Error('no event was published');
    }
    return event;
  };

  beforeEach(() => {
    publish = jest.fn().mockResolvedValue(undefined);
    service = new AppointmentPublisherService({ publish });
    logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('should publish an appointment.booked.v1 envelope with a fresh eventId when a booking is announced', async () => {
    await service.publishBooked(BOOKED);

    expect(publishedEvent()).toMatchObject({ ...BOOKED, v: 1, type: 'appointment.booked.v1' });
    expect(publishedEvent().eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(publishedEvent().occurredAt))).toBe(false);
  });

  it('should publish an appointment.cancelled.v1 envelope with the actor type when a cancellation is announced', async () => {
    await service.publishCancelled(CANCELLED);

    expect(publishedEvent()).toMatchObject({ ...CANCELLED, v: 1, type: 'appointment.cancelled.v1' });
  });

  it('should use a different eventId for every event when two events are published', async () => {
    await service.publishBooked(BOOKED);
    await service.publishBooked(BOOKED);

    const [first, second] = publish.mock.calls.map(([event]) => event.eventId);
    expect(first).not.toBe(second);
  });

  it('should log and not throw when the broker rejects the event after the booking has committed', async () => {
    publish.mockRejectedValue(new Error('broker down'));

    await expect(service.publishBooked(BOOKED)).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'appointment.booked.v1' }),
      expect.stringContaining('domain event was not published'),
    );
  });
});
