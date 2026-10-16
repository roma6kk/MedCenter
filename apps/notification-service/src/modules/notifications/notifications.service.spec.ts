import { ForbiddenException } from '@nestjs/common';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { NotificationsService } from './notifications.service';

const PATIENT = 'Patient/pat-1';

function communication(overrides: Record<string, unknown> = {}): FhirResource {
  return {
    resourceType: 'Communication',
    id: 'c-1',
    status: 'in-progress',
    category: [{ text: 'appointment' }],
    recipient: [{ reference: PATIENT }],
    sent: '2026-11-02T09:00:00.000Z',
    payload: [{ contentString: 'Вы записаны на приём.' }],
    ...overrides,
  };
}

describe('NotificationsService', () => {
  let fhir: jest.Mocked<FhirClient>;
  let service: NotificationsService;

  beforeEach(() => {
    fhir = {
      search: jest.fn().mockResolvedValue({ entry: [] }),
      read: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<FhirClient>;
    service = new NotificationsService(fhir);
  });

  describe('list', () => {
    it('should search the recipient newest first with the page window when the listing is read', async () => {
      // Act
      await service.list(PATIENT, { page: 2, pageSize: 10, unreadOnly: false });

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Communication', {
        recipient: PATIENT,
        _sort: '-sent',
        _count: 10,
        _offset: 10,
        _total: 'accurate',
      });
    });

    it('should add the in-progress status when only unread notifications are asked for', async () => {
      // Act
      await service.list(PATIENT, { page: 1, pageSize: 20, unreadOnly: true });

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Communication', expect.objectContaining({ status: 'in-progress' }));
    });

    it('should map category, text, sent and the read flag when a Communication is listed', async () => {
      // Arrange
      fhir.search.mockResolvedValue({
        entry: [{ resource: communication() }, { resource: communication({ id: 'c-2', status: 'completed' }) }],
      });

      // Act
      const { items } = await service.list(PATIENT, { page: 1, pageSize: 20, unreadOnly: false });

      // Assert
      expect(items).toEqual([
        { id: 'c-1', category: 'appointment', text: 'Вы записаны на приём.', sent: '2026-11-02T09:00:00.000Z', read: false },
        { id: 'c-2', category: 'appointment', text: 'Вы записаны на приём.', sent: '2026-11-02T09:00:00.000Z', read: true },
      ]);
    });

    it('should fall back to empty strings when a Communication has no payload, category or sent time', async () => {
      // Arrange
      fhir.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Communication', id: 'c-3', status: 'in-progress' } }] });

      // Act
      const { items } = await service.list(PATIENT, { page: 1, pageSize: 20, unreadOnly: false });

      // Assert
      expect(items).toEqual([{ id: 'c-3', category: '', text: '', sent: '', read: false }]);
    });

    it('should return an empty page when HAPI answers a Bundle without entries', async () => {
      // Arrange
      fhir.search.mockResolvedValue({});

      // Act
      const page = await service.list(PATIENT, { page: 1, pageSize: 20, unreadOnly: false });

      // Assert
      expect(page).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    });

    it('should wrap the items in the listing envelope with the accurate total when more notifications exist than one page holds', async () => {
      // Arrange
      fhir.search.mockResolvedValue({ total: 45, entry: [{ resource: communication() }] });

      // Act
      const page = await service.list(PATIENT, { page: 2, pageSize: 20, unreadOnly: false });

      // Assert
      expect(page.meta).toEqual({ page: 2, pageSize: 20, totalItems: 45, totalPages: 3 });
    });
  });

  describe('list without a total from HAPI', () => {
    it('should count the items of the earlier pages in totalItems when HAPI sends no total on page 3', async () => {
      // Arrange
      fhir.search.mockResolvedValue({ entry: [{ resource: communication() }, { resource: communication({ id: 'c-2' }) }] });

      // Act
      const page = await service.list(PATIENT, { page: 3, pageSize: 20, unreadOnly: false });

      // Assert
      expect(page.meta).toEqual({ page: 3, pageSize: 20, totalItems: 42, totalPages: 3 });
    });
  });

  describe('unreadCount', () => {
    it('should ask HAPI for a count summary of the in-progress notifications when the counter is polled', async () => {
      // Arrange
      fhir.search.mockResolvedValue({ total: 7 });

      // Act
      const count = await service.unreadCount(PATIENT);

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Communication', { recipient: PATIENT, status: 'in-progress', _summary: 'count' });
      expect(count).toBe(7);
    });

    it('should count zero when the Bundle carries no total', async () => {
      await expect(service.unreadCount(PATIENT)).resolves.toBe(0);
    });
  });

  describe('markRead', () => {
    it('should write the stored Communication back as completed when the recipient marks it read', async () => {
      // Arrange
      fhir.read.mockResolvedValue(communication());

      // Act
      await service.markRead(PATIENT, 'c-1');

      // Assert
      expect(fhir.update).toHaveBeenCalledWith('Communication', 'c-1', { ...communication(), status: 'completed' });
    });

    it('should find the caller among several recipients when the notification is shared', async () => {
      // Arrange
      fhir.read.mockResolvedValue(communication({ recipient: [{ reference: 'Patient/pat-2' }, { reference: PATIENT }] }));

      // Act
      await service.markRead(PATIENT, 'c-1');

      // Assert
      expect(fhir.update).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['another patient', { recipient: [{ reference: 'Patient/pat-2' }] }],
      ['a bare id of the caller instead of a reference', { recipient: [{ reference: 'pat-1' }] }],
      ['no recipient at all', { recipient: undefined }],
      ['an empty recipient list', { recipient: [] }],
    ])('should refuse with COMPARTMENT_VIOLATION and write nothing when the Communication names %s', async (_label, overrides) => {
      // Arrange
      fhir.read.mockResolvedValue(communication(overrides));

      // Act
      const result = service.markRead(PATIENT, 'c-1');

      // Assert
      await expect(result).rejects.toBeInstanceOf(ForbiddenException);
      await expect(result).rejects.toMatchObject({ response: { errorCode: 'COMPARTMENT_VIOLATION' } });
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it('should let the 404 of an unknown notification through when HAPI has no such Communication', async () => {
      // Arrange
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Communication/ghost', 404, '{}'));

      // Act
      const result = service.markRead(PATIENT, 'ghost');

      // Assert
      await expect(result).rejects.toMatchObject({ status: 404 });
      expect(fhir.update).not.toHaveBeenCalled();
    });
  });
});
