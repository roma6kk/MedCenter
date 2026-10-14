import type { AuditEventRow, AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

const NOW = new Date('2026-10-13T08:00:00.000Z');

const ROW: AuditEventRow = {
  id: 'ae-1',
  occurredAt: new Date('2026-10-08T10:00:00.000Z'),
  userId: 'user-1',
  action: 'create',
  resourceType: 'Appointment',
  resourceId: 'appt-1',
  requestId: null,
  source: 'appointment-service',
};

describe('AuditService', () => {
  let repository: jest.Mocked<AuditRepository>;
  let auditService: AuditService;

  beforeEach(() => {
    repository = {
      findPage: jest.fn().mockResolvedValue({ rows: [ROW], total: 41 }),
      insertMany: jest.fn(),
      readCursor: jest.fn(),
      advanceCursor: jest.fn(),
    };
    auditService = new AuditService(repository, () => NOW);
  });

  it('should return a paginated envelope of AuditEventDto when the read-model has rows', async () => {
    const page = await auditService.list({ from: '2026-10-01', to: '2026-10-31', page: 2, pageSize: 20 });

    expect(page).toEqual({
      items: [
        {
          id: 'ae-1',
          occurredAt: '2026-10-08T10:00:00.000Z',
          userId: 'user-1',
          action: 'create',
          resourceType: 'Appointment',
          resourceId: 'appt-1',
          requestId: '',
        },
      ],
      meta: { page: 2, pageSize: 20, totalItems: 41, totalPages: 3 },
    });
  });

  it('should translate page and pageSize into offset and limit when a later page is requested', async () => {
    await auditService.list({ page: 3, pageSize: 10 });

    expect(repository.findPage).toHaveBeenCalledWith(expect.anything(), { offset: 20, limit: 10 });
  });

  it('should default to the first page of 20 when no paging is given', async () => {
    await auditService.list({});

    expect(repository.findPage).toHaveBeenCalledWith(expect.anything(), { offset: 0, limit: 20 });
  });

  it('should filter by resource type only when entity is a bare resource type', async () => {
    await auditService.list({ entity: 'Appointment', userId: 'user-1' });

    expect(repository.findPage).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'Appointment', resourceId: undefined, userId: 'user-1' }),
      expect.anything(),
    );
  });

  it('should filter by type and id when entity is a relative reference', async () => {
    await auditService.list({ entity: 'Appointment/appt-1' });

    expect(repository.findPage).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'Appointment', resourceId: 'appt-1' }),
      expect.anything(),
    );
  });

  it('should reject a period longer than 366 days before querying the read-model when the span is too wide', async () => {
    await expect(auditService.list({ from: '2025-01-01', to: '2026-10-01' })).rejects.toThrow('range');
    expect(repository.findPage).not.toHaveBeenCalled();
  });

  it('should report zero pages when the filter matches nothing', async () => {
    repository.findPage.mockResolvedValue({ rows: [], total: 0 });

    const page = await auditService.list({});

    expect(page.meta).toEqual({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  });
});
