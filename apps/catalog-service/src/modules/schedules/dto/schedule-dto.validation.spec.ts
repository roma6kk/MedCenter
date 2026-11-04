import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateScheduleDto } from './create-schedule.dto';
import { GenerateSlotsDto } from './generate-slots.dto';
import { UpdateScheduleDto } from './update-schedule.dto';

const VALID = {
  practitionerRoleId: '1',
  roomId: '2',
  serviceId: '3',
  horizonFrom: '2026-11-01',
  horizonTo: '2026-11-30',
  slotDurationMin: 30,
  windows: [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' }],
};

async function failures(cls: new () => object, body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body));
  const walk = (list: typeof errors, path: string): string[] =>
    list.flatMap((error) => {
      const here = path === '' ? error.property : `${path}.${error.property}`;
      return [...(error.constraints === undefined ? [] : [here]), ...walk(error.children ?? [], here)];
    });
  return walk(errors, '');
}

describe('schedule DTOs', () => {
  it('should accept a valid schedule', async () => {
    expect(await failures(CreateScheduleDto, VALID)).toEqual([]);
  });

  it.each(['2026-02-31', '2026-W45', '2026-306', '2026-11-01T10:00:00Z', 'tomorrow'])(
    'should refuse %s as a horizon or a range bound',
    async (value) => {
      expect(await failures(CreateScheduleDto, { ...VALID, horizonFrom: value })).toEqual(['horizonFrom']);
      expect(await failures(UpdateScheduleDto, { horizonTo: value })).toEqual(['horizonTo']);
      expect(await failures(GenerateSlotsDto, { from: value, to: '2026-11-02' })).toEqual(['from']);
    },
  );

  it.each([
    ['ends before it starts', '13:00', '09:00'],
    ['ends when it starts', '10:00', '10:00'],
  ])('should refuse a window that %s, naming windows.0.endTime', async (_label, startTime, endTime) => {
    const windows = [{ dayOfWeek: 'MO', startTime, endTime }];

    expect(await failures(CreateScheduleDto, { ...VALID, windows })).toEqual(['windows.0.endTime']);
    expect(await failures(UpdateScheduleDto, { windows })).toEqual(['windows.0.endTime']);
  });

  it('should accept a five-minute window', async () => {
    const windows = [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '09:05' }];

    expect(await failures(CreateScheduleDto, { ...VALID, windows, slotDurationMin: 5 })).toEqual([]);
  });
});
