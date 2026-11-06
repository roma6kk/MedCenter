import { MEDCENTER_EXT, OUTBOX, type OutboxStatus } from '@medcenter/terminology';

import type { FhirResource } from './fhir-client.provider';

export interface OutboxEventInput {
  readonly type: string;
  readonly eventId: string;
}

export interface OutboxWrite {
  readonly method: 'POST';
  readonly url: 'Basic';
  readonly resource: FhirResource;
}

/** A `Basic` with no references to other resources (they would block deleting it), written in the transaction of the business change. */
export function buildOutboxBasic(event: OutboxEventInput): FhirResource {
  return {
    resourceType: 'Basic',
    meta: { tag: [{ system: OUTBOX.STATUS_SYSTEM, code: OUTBOX.PENDING }] },
    code: { coding: [{ system: OUTBOX.CODE_SYSTEM, code: OUTBOX.EVENT_CODE }] },
    extension: [
      { url: MEDCENTER_EXT.OUTBOX_EVENT_TYPE, valueCode: event.type },
      { url: MEDCENTER_EXT.OUTBOX_EVENT_ID, valueString: event.eventId },
      { url: MEDCENTER_EXT.OUTBOX_PAYLOAD, valueString: JSON.stringify(event) },
    ],
  };
}

export function outboxWrite(event: OutboxEventInput): OutboxWrite {
  return { method: 'POST', url: 'Basic', resource: buildOutboxBasic(event) };
}

export interface OutboxRecord {
  readonly id: string;
  readonly version: string;
  readonly status: OutboxStatus;
  readonly eventType: string;
  readonly eventId: string;
  readonly payload: string;
  readonly lastUpdated: Date | undefined;
  readonly resource: FhirResource;
}

function extensionString(resource: FhirResource, url: string, field: 'valueString' | 'valueCode'): string | undefined {
  const extensions = resource['extension'];
  if (!Array.isArray(extensions)) {
    return undefined;
  }
  for (const extension of extensions as ReadonlyArray<Record<string, unknown>>) {
    if (extension['url'] === url && typeof extension[field] === 'string') {
      return extension[field] as string;
    }
  }
  return undefined;
}

/**
 * The delivery state, or `undefined` when the record carries none of ours.
 * HAPI keeps existing tags on a `PUT` (non-versioned tag storage), so a sent
 * record carries both `pending` and `sent`: `sent` wins, as it is always the later one.
 */
export function outboxStatusOf(resource: FhirResource): OutboxStatus | undefined {
  const meta = resource['meta'] as { tag?: ReadonlyArray<{ system?: unknown; code?: unknown }> } | undefined;
  const codes = (meta?.tag ?? []).filter((candidate) => candidate.system === OUTBOX.STATUS_SYSTEM).map((candidate) => candidate.code);
  if (codes.includes(OUTBOX.SENT)) {
    return OUTBOX.SENT;
  }
  return codes.includes(OUTBOX.PENDING) ? OUTBOX.PENDING : undefined;
}

export function parseOutboxRecord(resource: FhirResource): OutboxRecord | undefined {
  const meta = resource['meta'] as { versionId?: unknown; lastUpdated?: unknown } | undefined;
  const status = outboxStatusOf(resource);
  const eventType = extensionString(resource, MEDCENTER_EXT.OUTBOX_EVENT_TYPE, 'valueCode');
  const eventId = extensionString(resource, MEDCENTER_EXT.OUTBOX_EVENT_ID, 'valueString');
  const payload = extensionString(resource, MEDCENTER_EXT.OUTBOX_PAYLOAD, 'valueString');
  if (
    resource.id === undefined ||
    typeof meta?.versionId !== 'string' ||
    status === undefined ||
    eventType === undefined ||
    eventId === undefined ||
    payload === undefined
  ) {
    return undefined;
  }
  const updated = typeof meta.lastUpdated === 'string' ? new Date(meta.lastUpdated) : undefined;
  return {
    id: resource.id,
    version: `W/"${meta.versionId}"`,
    status,
    eventType,
    eventId,
    payload,
    lastUpdated: updated === undefined || Number.isNaN(updated.getTime()) ? undefined : updated,
    resource,
  };
}

export function withOutboxStatus(resource: FhirResource, status: OutboxStatus): FhirResource {
  const meta = (resource['meta'] ?? {}) as { tag?: ReadonlyArray<{ system?: unknown }> };
  const others = (meta.tag ?? []).filter((tag) => tag.system !== OUTBOX.STATUS_SYSTEM);
  return { ...resource, meta: { ...meta, tag: [...others, { system: OUTBOX.STATUS_SYSTEM, code: status }] } };
}
