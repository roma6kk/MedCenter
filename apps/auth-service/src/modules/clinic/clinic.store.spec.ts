import type { DataSource } from 'typeorm';

import { TypeOrmClinicStore } from './clinic.store';

describe('TypeOrmClinicStore', () => {
  const row = { name: 'A', phone: '+375 17 000-00-00', email: 'a@b.by', address: 'X', hours: 'Y' };

  function storeOver(query: jest.Mock): TypeOrmClinicStore {
    return new TypeOrmClinicStore({ query } as unknown as DataSource);
  }

  it('should read the single row', async () => {
    const query = jest.fn().mockResolvedValue([row]);

    expect(await storeOver(query).get()).toEqual(row);
    expect(query.mock.calls[0]?.[0]).toContain('FROM "auth"."clinic_settings" WHERE "id" = 1');
  });

  it('should update only the given columns and stamp updated_at', async () => {
    const query = jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce([row]);

    await storeOver(query).update({ phone: '+375 29 111-11-11', name: 'B' });

    expect(query.mock.calls[0]?.[0]).toBe(
      'UPDATE "auth"."clinic_settings" SET "name" = $1, "phone" = $2, "updated_at" = now() WHERE "id" = 1',
    );
    expect(query.mock.calls[0]?.[1]).toEqual(['B', '+375 29 111-11-11']);
  });

  it('should not write when nothing changes', async () => {
    const query = jest.fn().mockResolvedValue([row]);

    await storeOver(query).update({});

    expect(query).toHaveBeenCalledTimes(1);
  });
});
