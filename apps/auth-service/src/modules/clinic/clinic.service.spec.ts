import type { AuditService } from '../audit/audit.service';
import { InMemoryClinicStore, SEEDED_CLINIC } from './__tests__/in-memory-clinic.store';
import { ClinicService } from './clinic.service';

describe('ClinicService', () => {
  const actor = { sub: 'admin-1', requestId: 'req-1' };
  let audit: { recordClinicChange: jest.Mock };
  let service: ClinicService;

  beforeEach(() => {
    audit = { recordClinicChange: jest.fn().mockResolvedValue(undefined) };
    service = new ClinicService(new InMemoryClinicStore(), audit as unknown as AuditService);
  });

  it('should return the stored details', async () => {
    expect(await service.get()).toEqual(SEEDED_CLINIC);
  });

  it('should change only the given fields and audit them', async () => {
    const updated = await service.update({ phone: '+375 29 111-11-11', hours: '24/7' }, actor);

    expect(updated).toEqual({ ...SEEDED_CLINIC, phone: '+375 29 111-11-11', hours: '24/7' });
    expect(await service.get()).toEqual(updated);
    expect(audit.recordClinicChange).toHaveBeenCalledWith({ actor, changedFields: ['phone', 'hours'] });
  });

  it('should leave the details and the audit alone when the body is empty', async () => {
    expect(await service.update({}, actor)).toEqual(SEEDED_CLINIC);
    expect(audit.recordClinicChange).not.toHaveBeenCalled();
  });
});
