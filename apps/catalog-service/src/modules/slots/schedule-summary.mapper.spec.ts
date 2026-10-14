import { Logger } from '@nestjs/common';

import {
  PLANNING_HORIZON_EXT,
  SLOT_DURATION_EXT,
  WEEKLY_WINDOWS_EXT,
} from '../schedules/schedule.constants';
import { toScheduleSummaryDto } from './schedule-summary.mapper';

describe('toScheduleSummaryDto', () => {
  it('should map actors, horizon, duration and weekly windows when every extension is present', () => {
    // Arrange
    const schedule = {
      resourceType: 'Schedule',
      id: 'sched-1',
      active: true,
      comment: 'Утренний приём',
      actor: [
        { reference: 'PractitionerRole/role-7' },
        { reference: 'Location/room-204' },
        { reference: 'HealthcareService/svc-1' },
      ],
      extension: [
        { url: SLOT_DURATION_EXT, valueInteger: 30 },
        { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' }]) },
        { url: PLANNING_HORIZON_EXT, valuePeriod: { start: '2026-11-01', end: '2026-11-30' } },
      ],
    };

    // Act
    const dto = toScheduleSummaryDto(schedule);

    // Assert
    expect(dto).toEqual({
      id: 'sched-1',
      isActive: true,
      practitionerRoleId: 'role-7',
      roomId: 'room-204',
      serviceId: 'svc-1',
      horizonFrom: '2026-11-01',
      horizonTo: '2026-11-30',
      slotDurationMin: 30,
      windows: [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' }],
      comment: 'Утренний приём',
    });
  });

  it('should fall back to empty windows and omit unknown fields when the extensions are missing or malformed', () => {
    // Arrange
    const schedule = {
      resourceType: 'Schedule',
      id: 'sched-2',
      extension: [{ url: WEEKLY_WINDOWS_EXT, valueString: '{not json' }],
    };

    // Act
    const dto = toScheduleSummaryDto(schedule);

    // Assert
    expect(dto).toEqual({ id: 'sched-2', isActive: true, windows: [] });
  });

  it('should log a warning with the schedule id when the stored windows are not valid JSON', () => {
    // Arrange
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const schedule = {
      resourceType: 'Schedule',
      id: 'sched-2',
      extension: [{ url: WEEKLY_WINDOWS_EXT, valueString: '{not json' }],
    };

    // Act
    toScheduleSummaryDto(schedule);

    // Assert — the doctor sees a schedule without windows; the log is the only trace.
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: 'sched-2' }), expect.any(String));
    warn.mockRestore();
  });

  it('should drop window entries that are not well-formed weekly windows', () => {
    // Arrange
    const schedule = {
      resourceType: 'Schedule',
      id: 'sched-3',
      active: false,
      extension: [
        {
          url: WEEKLY_WINDOWS_EXT,
          valueString: JSON.stringify([{ dayOfWeek: 'XX', startTime: '09:00', endTime: '10:00' }, { dayOfWeek: 'TU', startTime: '10:00', endTime: '11:00' }]),
        },
      ],
    };

    // Act
    const dto = toScheduleSummaryDto(schedule);

    // Assert
    expect(dto.isActive).toBe(false);
    expect(dto.windows).toEqual([{ dayOfWeek: 'TU', startTime: '10:00', endTime: '11:00' }]);
  });
});
