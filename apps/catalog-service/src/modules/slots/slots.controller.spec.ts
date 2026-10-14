import { ForbiddenException } from '@nestjs/common';
import type { RequestWithClaims } from '@medcenter/common';

import type { DoctorScheduleService } from './doctor-schedule.service';
import type { DoctorSlotsService } from './doctor-slots.service';
import { SlotsController } from './slots.controller';

function doctorRequest(fhirUser?: string): RequestWithClaims {
  return {
    user: {
      sub: 'user-1',
      scope: 'user/*.read',
      role: 'DOCTOR',
      jti: 'jti-1',
      ...(fhirUser === undefined ? {} : { fhirUser }),
    },
  };
}

describe('SlotsController', () => {
  const NOW = Date.parse('2026-11-02T10:00:00.000Z');
  let doctorSlots: jest.Mocked<Pick<DoctorSlotsService, 'listFree'>>;
  let doctorSchedule: jest.Mocked<Pick<DoctorScheduleService, 'forRole'>>;
  let controller: SlotsController;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    doctorSlots = { listFree: jest.fn().mockResolvedValue({ items: [] }) };
    doctorSchedule = { forRole: jest.fn().mockResolvedValue({ items: [] }) };
    controller = new SlotsController(
      doctorSlots as unknown as DoctorSlotsService,
      doctorSchedule as unknown as DoctorScheduleService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should query the token PractitionerRole with the default window when no range is given', async () => {
    // Act
    await controller.ownSchedule(doctorRequest('PractitionerRole/role-7'), {});

    // Assert
    expect(doctorSchedule.forRole).toHaveBeenCalledWith(
      'role-7',
      expect.objectContaining({ from: '2026-11-02', to: '2026-11-16' }),
    );
  });

  it('should refuse the schedule before touching FHIR when the token has no PractitionerRole', async () => {
    // Act
    const call = controller.ownSchedule(doctorRequest(), { from: '2026-11-01', to: '2027-01-01' });

    // Assert
    await expect(call).rejects.toBeInstanceOf(ForbiddenException);
    expect(doctorSchedule.forRole).not.toHaveBeenCalled();
  });

  it('should pass the path id and the requested range to the slot search when the range is valid', async () => {
    // Act
    await controller.listDoctorSlots({ id: 'prac-1' }, { from: '2026-11-03', to: '2026-11-04' });

    // Assert
    expect(doctorSlots.listFree).toHaveBeenCalledWith(
      'prac-1',
      expect.objectContaining({ from: '2026-11-03', to: '2026-11-04' }),
    );
  });
});
