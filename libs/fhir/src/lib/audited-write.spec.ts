import { ConflictException } from '@nestjs/common';

import { createAudited, deleteAudited, updateAudited } from './audited-write';
import { FhirClientError, type FhirClient } from './fhir-client.provider';
import { FHIR_RESOURCE_ID_SYSTEM } from './write-audit';

const AUDIT = { actor: { sub: 'admin-1', requestId: 'req-1' }, source: 'catalog-service' };

interface Sent {
  readonly type: string;
  readonly entry: Array<{ resource?: { resourceType: string; id?: string }; request: Record<string, string> }>;
}

function client(): jest.Mocked<FhirClient> {
  return { batch: jest.fn().mockResolvedValue({ resourceType: 'Bundle', type: 'transaction-response', entry: [] }) } as unknown as jest.Mocked<FhirClient>;
}

const sent = (fhir: jest.Mocked<FhirClient>): Sent => fhir.batch.mock.calls[0]?.[0] as unknown as Sent;
const methodsOf = (fhir: jest.Mocked<FhirClient>): string[] => sent(fhir).entry.map((entry) => `${entry.request['method']} ${entry.request['url']}`);

describe('createAudited', () => {
  it('should store the resource under a new id and its create AuditEvent in one transaction, the event naming that id', async () => {
    const fhir = client();

    const created = await createAudited(fhir, { resourceType: 'Location', name: 'Кабинет' }, AUDIT);

    expect(created).toMatchObject({ resourceType: 'Location', name: 'Кабинет', id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(sent(fhir).type).toBe('transaction');
    expect(methodsOf(fhir)).toEqual([`PUT Location/${created.id}`, 'POST AuditEvent']);
    expect(sent(fhir).entry[0]?.resource).toEqual(created);
    expect(sent(fhir).entry[1]?.resource).toMatchObject({
      action: 'C',
      entity: [{ what: { type: 'Location', identifier: { system: FHIR_RESOURCE_ID_SYSTEM, value: created.id } } }, expect.anything()],
    });
  });

  it('should make the create a conditional update when a match URL is given, so a duplicate fails the whole transaction', async () => {
    const fhir = client();

    const created = await createAudited(fhir, { resourceType: 'Location' }, AUDIT, { onlyIfNoneMatches: 'Location?identifier=204' });

    expect(methodsOf(fhir)).toEqual(['PUT Location?identifier=204', 'POST AuditEvent']);
    expect(sent(fhir).entry[0]?.resource?.id).toBe(created.id);
  });

  it('should give two creates two different ids', async () => {
    const first = await createAudited(client(), { resourceType: 'Schedule' }, AUDIT);
    const second = await createAudited(client(), { resourceType: 'Schedule' }, AUDIT);

    expect(first.id).not.toBe(second.id);
  });

  it('should answer 409 CONFLICT and keep nothing when HAPI refuses the transaction as a conflict', async () => {
    const fhir = { batch: jest.fn().mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 412, '{}')) } as unknown as jest.Mocked<FhirClient>;

    const error = await createAudited(fhir, { resourceType: 'Location' }, AUDIT).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ errorCode: 'CONFLICT' });
  });
});

describe('updateAudited', () => {
  it('should PUT the resource and write its update AuditEvent in one transaction', async () => {
    const fhir = client();

    const updated = await updateAudited(fhir, { resourceType: 'Location', id: 'room-1', name: 'Новое' }, AUDIT);

    expect(methodsOf(fhir)).toEqual(['PUT Location/room-1', 'POST AuditEvent']);
    expect(sent(fhir).entry[1]?.resource).toMatchObject({ action: 'U', entity: [{ what: { type: 'Location', identifier: { value: 'room-1' } } }, expect.anything()] });
    expect(updated).toEqual({ resourceType: 'Location', id: 'room-1', name: 'Новое' });
  });
});

describe('deleteAudited', () => {
  it('should DELETE the resource and write its delete AuditEvent in one transaction, without a body for the delete', async () => {
    const fhir = client();

    await deleteAudited(fhir, 'Location', 'room-1', AUDIT);

    const [deletion, audit] = sent(fhir).entry;
    expect(deletion).toEqual({ request: { method: 'DELETE', url: 'Location/room-1' } });
    expect(audit?.resource).toMatchObject({ action: 'D', subtype: [{ code: 'delete' }], entity: [{ what: { type: 'Location', identifier: { value: 'room-1' } } }, expect.anything()] });
  });
});
