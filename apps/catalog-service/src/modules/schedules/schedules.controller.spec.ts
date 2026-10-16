import { IdempotencyService, type IdempotencyStore, type RequestWithClaims } from '@medcenter/common';

import { SchedulesController } from './schedules.controller';
import type { SchedulesService } from './schedules.service';
import type { SlotGeneratorService } from './slot-generator.service';

const KEY = '3f0b6f0e-0000-4000-8000-0000000000a1';
const admin: RequestWithClaims = { user: { sub: 'admin-1', scope: 'user/*.write', role: 'ADMIN', jti: 'j-1' } };

function memoryStore(): IdempotencyStore {
  const entries = new Map<string, string>();
  return {
    get: async (key) => entries.get(key) ?? null,
    set: async (key, value) => {
      entries.set(key, value);
    },
  };
}

describe('SchedulesController.generate', () => {
  let generate: jest.Mock;
  let controller: SchedulesController;

  beforeEach(() => {
    generate = jest.fn().mockResolvedValueOnce({ generated: 12, skipped: 0 }).mockResolvedValue({ generated: 0, skipped: 12 });
    controller = new SchedulesController(
      {} as SchedulesService,
      { generate } as unknown as SlotGeneratorService,
      new IdempotencyService(memoryStore()),
    );
  });

  it('should answer a replayed Idempotency-Key with the first result without generating again', async () => {
    const dto = { from: '2026-12-01', to: '2026-12-14' };

    const first = await controller.generate(admin, KEY, { id: 'sched-1' }, dto);
    const replay = await controller.generate(admin, KEY, { id: 'sched-1' }, dto);

    expect(replay).toEqual(first);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('should generate on every call when no Idempotency-Key is sent', async () => {
    const dto = { from: '2026-12-01', to: '2026-12-14' };

    await controller.generate(admin, undefined, { id: 'sched-1' }, dto);
    await controller.generate(admin, undefined, { id: 'sched-1' }, dto);

    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('should refuse the same key for a different range with 409 instead of replaying a result for another request', async () => {
    await controller.generate(admin, KEY, { id: 'sched-1' }, { from: '2026-12-01', to: '2026-12-14' });

    await expect(controller.generate(admin, KEY, { id: 'sched-1' }, { from: '2026-12-01', to: '2026-12-31' })).rejects.toMatchObject({ status: 409 });
  });

  it('should refuse a key that is not a UUID with 400', async () => {
    await expect(controller.generate(admin, 'not-a-uuid', { id: 'sched-1' }, { from: '2026-12-01', to: '2026-12-14' })).rejects.toMatchObject({ status: 400 });
  });

  it('should not share a replay between two schedules that use the same key', async () => {
    const dto = { from: '2026-12-01', to: '2026-12-14' };

    await controller.generate(admin, KEY, { id: 'sched-1' }, dto);
    await controller.generate(admin, KEY, { id: 'sched-2' }, dto);

    expect(generate).toHaveBeenCalledTimes(2);
  });
});
