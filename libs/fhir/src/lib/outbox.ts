import { MEDCENTER_EXT, OUTBOX, type OutboxStatus } from '@medcenter/terminology';

import type { FhirResource } from './fhir-client.provider';

/** An event envelope as a service builds it; only the two routing fields are read here. */
export interface OutboxEventInput {
  readonly type: string;
  readonly eventId: string;
  readonly [key: string]: unknown;
}

/** The `POST Basic` entry of a transaction Bundle; assignable to every service's own write type. */
export interface OutboxWrite {
  readonly method: 'POST';
  readonly url: 'Basic';
  readonly resource: FhirResource;
}

/**
 * The outbox record of an event (ADR-021): a `Basic` with no `subject` and no
 * references to other resources (HAPI referential integrity would then block
 * deleting them). Written in the same transaction Bundle as the business change,
 * so the event exists if and only if the change committed.
 */
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

/** The transaction entry that records `event` in the outbox. */
export function outboxWrite(event: OutboxEventInput): OutboxWrite {
  return { method: 'POST', url: 'Basic', resource: buildOutboxBasic(event) };
}

/** An outbox record as the relay reads it. */
export interface OutboxRecord {
  readonly id: string;
  /** `W/"<versionId>"` as read, for the `If-Match` of the status update. */
  readonly version: string;
  readonly status: OutboxStatus;
  readonly eventType: string;
  readonly eventId: string;
  /** The event envelope, still JSON text. */
  readonly payload: string;
  /** `meta.lastUpdated`: the write time while pending, the send time once sent. */
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

/** The delivery state tag, or `undefined` when the record carries none of ours. */
export function outboxStatusOf(resource: FhirResource): OutboxStatus | undefined {
  const meta = resource['meta'] as { tag?: ReadonlyArray<{ system?: unknown; code?: unknown }> } | undefined;
  const tag = meta?.tag?.find((candidate) => candidate.system === OUTBOX.STATUS_SYSTEM);
  return tag?.code === OUTBOX.PENDING || tag?.code === OUTBOX.SENT ? tag.code : undefined;
}

/**
 * Reads an outbox `Basic`; `undefined` when it is not a well-formed outbox
 * record (no id/version/status, type, id or payload). The payload is not parsed.
 */
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

/** The same record with its delivery state replaced; every other field is kept. */
export function withOutboxStatus(resource: FhirResource, status: OutboxStatus): FhirResource {
  const meta = (resource['meta'] ?? {}) as { tag?: ReadonlyArray<{ system?: unknown }> };
  const others = (meta.tag ?? []).filter((tag) => tag.system !== OUTBOX.STATUS_SYSTEM);
  return { ...resource, meta: { ...meta, tag: [...others, { system: OUTBOX.STATUS_SYSTEM, code: status }] } };
}
