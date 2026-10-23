import { MEDCENTER_EXT, OUTBOX } from '@medcenter/terminology';

import { buildOutboxBasic, outboxStatusOf, outboxWrite, parseOutboxRecord, withOutboxStatus } from './outbox';

const EVENT = { v: 1, type: 'appointment.booked.v1', eventId: 'e-1', occurredAt: '2026-10-23T10:00:00Z', appointmentId: 'a-1' } as const;

describe('outbox Basic', () => {
  it('should build a pending Basic without subject or references when an event is recorded', () => {
    const basic = buildOutboxBasic(EVENT);

    expect(basic).toMatchObject({
      resourceType: 'Basic',
      meta: { tag: [{ system: OUTBOX.STATUS_SYSTEM, code: 'pending' }] },
      code: { coding: [{ system: OUTBOX.CODE_SYSTEM, code: OUTBOX.EVENT_CODE }] },
    });
    expect(basic).not.toHaveProperty('subject');
    expect(JSON.stringify(basic)).not.toContain('"reference"');
  });

  it('should keep the whole envelope in the payload extension', () => {
    const basic = buildOutboxBasic(EVENT);
    const payload = (basic['extension'] as Array<{ url: string; valueString?: string }>).find(
      (extension) => extension.url === MEDCENTER_EXT.OUTBOX_PAYLOAD,
    );

    expect(JSON.parse(payload?.valueString ?? '')).toEqual(EVENT);
  });

  it('should wrap the record as a POST Basic transaction entry', () => {
    expect(outboxWrite(EVENT)).toMatchObject({ method: 'POST', url: 'Basic', resource: { resourceType: 'Basic' } });
  });

  it('should parse a stored record when it carries id, version, status and the three extensions', () => {
    const stored = { ...buildOutboxBasic(EVENT), id: 'b-1', meta: { versionId: '3', lastUpdated: '2026-10-23T10:00:01.000Z', tag: [{ system: OUTBOX.STATUS_SYSTEM, code: 'pending' }] } };

    const record = parseOutboxRecord(stored);

    expect(record).toMatchObject({ id: 'b-1', version: 'W/"3"', status: 'pending', eventType: EVENT.type, eventId: 'e-1' });
    expect(record?.lastUpdated?.toISOString()).toBe('2026-10-23T10:00:01.000Z');
    expect(JSON.parse(record?.payload ?? '')).toEqual(EVENT);
  });

  it('should read sent when HAPI kept the old pending tag next to the new sent tag', () => {
    const tags = [{ system: OUTBOX.STATUS_SYSTEM, code: 'pending' }, { system: OUTBOX.STATUS_SYSTEM, code: 'sent' }];
    const stored = { ...buildOutboxBasic(EVENT), id: 'b-1', meta: { versionId: '2', tag: tags } };

    expect(parseOutboxRecord(stored)?.status).toBe('sent');
  });

  it('should return undefined when the record is not a complete outbox record', () => {
    expect(parseOutboxRecord({ resourceType: 'Basic', id: 'b-1', meta: { versionId: '1' } })).toBeUndefined();
    expect(parseOutboxRecord({ ...buildOutboxBasic(EVENT), id: 'b-1' })).toBeUndefined();
  });

  it('should swap the status tag and keep other tags when a record is marked sent', () => {
    const base = { ...buildOutboxBasic(EVENT), meta: { tag: [{ system: 'x', code: 'y' }, { system: OUTBOX.STATUS_SYSTEM, code: 'pending' }] } };

    const sent = withOutboxStatus(base, 'sent');

    expect(outboxStatusOf(sent)).toBe('sent');
    expect((sent['meta'] as { tag: unknown[] }).tag).toEqual([{ system: 'x', code: 'y' }, { system: OUTBOX.STATUS_SYSTEM, code: 'sent' }]);
  });
});
