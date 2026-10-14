import { Logger } from '@nestjs/common';
import type { EventPublisher } from '@medcenter/messaging';

import { EncounterPublisherService } from './encounter-publisher.service';

const payload = {
  encounterId: 'enc-1',
  patientRef: 'Patient/pat-1',
  practitionerRef: 'PractitionerRole/role-1',
  diagnoses: [{ code: 'J06.9', display: 'ОРВИ' }],
};

describe('EncounterPublisherService', () => {
  let publisher: jest.Mocked<EventPublisher>;
  let service: EncounterPublisherService;

  beforeEach(() => {
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new EncounterPublisherService(publisher);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should publish a versioned encounter.completed.v1 envelope with a fresh eventId when called', async () => {
    await service.publishCompleted(payload);

    expect(publisher.publish).toHaveBeenCalledWith({
      ...payload,
      v: 1,
      type: 'encounter.completed.v1',
      eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      occurredAt: expect.any(String),
    });
  });

  it('should log and resolve when the broker rejects the event', async () => {
    publisher.publish.mockRejectedValue(new Error('broker down'));
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(service.publishCompleted(payload)).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'encounter.completed.v1', encounterId: 'enc-1' }),
      expect.stringContaining('not published'),
    );
  });
});
