import type { FhirResource } from '@medcenter/fhir';

import type { AuditAction } from '../../database/entities/audit-event-read.entity';
import type { AuditEventRow } from './audit.repository';

type Json = Readonly<Record<string, unknown>>;

/** R4 `AuditEventAction` → journal action; a bare `R` (read) or `E` (execute) without a restful subtype is not journalled. */
const ACTION_BY_CODE: Readonly<Record<string, AuditAction>> = { C: 'create', U: 'update', D: 'delete' };
const WRITE_SUBTYPES: ReadonlySet<string> = new Set(['create', 'update', 'delete']);
/** Read interactions written by `PatientReadAudit` (ADR-018); `AuditEvent.outcome` 4 marks a refused read. */
const READ_SUBTYPES: ReadonlySet<string> = new Set(['read', 'search-type']);
const OUTCOME_MINOR_FAILURE = '4';
/** `AuditEvent.subtype` of the emergency consent bypass (`buildEmergencyBypassAuditEvent`, ADR-019). */
const BYPASS_SUBTYPE = 'consent-emergency-bypass';

/** IHE BALP entity type carrying the `X-Request-Id` correlation id. */
const REQUEST_ID_ENTITY_TYPE = 'XrequestId';
const REQUEST_ID_DETAIL_TYPES: ReadonlySet<string> = new Set(['requestId', 'x-request-id', 'X-Request-Id']);

/** Column widths of `analytics.audit_event` (migration `AnalyticsInit`). HAPI is an external source: nothing may overflow them. */
const USER_ID_MAX = 128;
const REQUEST_ID_MAX = 128;
const SOURCE_MAX = 128;
const REASON_MAX = 500;

/** FHIR `id` (`[A-Za-z0-9\-.]{1,64}`), the width of `audit_event.id` / `resource_id`. */
const FHIR_ID = /^[A-Za-z0-9\-.]{1,64}$/;
const RELATIVE_REFERENCE = /^([A-Z][A-Za-z]{1,63})\/([A-Za-z0-9\-.]{1,64})(\/_history\/[A-Za-z0-9\-.]{1,64})?$/;

/**
 * `auth.user` accounts have no FHIR resource: auth-service files them as an
 * `entity.what.identifier` of this system (its `AUTH_USER_IDENTIFIER_SYSTEM`).
 * The journal shows them as `AuthUser/{id}` so the row is not blank.
 */
const AUTH_USER_IDENTIFIER_SYSTEM = 'https://api.medcenter.by/sid/auth-user';
const AUTH_USER_RESOURCE_TYPE = 'AuthUser';

function asObject(value: unknown): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : undefined;
}

function asObjects(value: unknown): ReadonlyArray<Json> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item: unknown): Json[] => {
    const object = asObject(item);
    return object === undefined ? [] : [object];
  });
}

/** Non-empty text; NUL is stripped because PostgreSQL text columns reject it (`22021`). */
function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const text = value.split('\u0000').join('');
  return text.length > 0 ? text : undefined;
}

/** Fits free text into its column: a long value is clipped, never allowed to reject the whole page. */
function fit(value: string | undefined, max: number): string | null {
  return value === undefined ? null : value.slice(0, max);
}

/**
 * A restful `subtype` wins over the coarse `action` code: a write subtype is its own action, a read subtype is
 * `read`, or `denied` when the event records a refusal (`outcome` 4).
 */
function actionOf(resource: FhirResource): AuditAction | undefined {
  const subtypes = asObjects(resource['subtype']).map((coding) => asString(coding['code']));
  const write = subtypes.find((code): code is AuditAction => code !== undefined && WRITE_SUBTYPES.has(code));
  if (write !== undefined) {
    return write;
  }
  if (subtypes.includes(BYPASS_SUBTYPE)) {
    return 'emergency-bypass';
  }
  if (subtypes.some((code) => code !== undefined && READ_SUBTYPES.has(code))) {
    return asString(resource['outcome']) === OUTCOME_MINOR_FAILURE ? 'denied' : 'read';
  }
  return ACTION_BY_CODE[asString(resource['action']) ?? ''];
}

/**
 * The user is the requesting agent. Services write the token `sub` as
 * `agent.who.identifier.value` (appointment-service `audit.ts`); a literal
 * `who.reference` or `altId` is the fallback.
 */
function userIdOf(resource: FhirResource): string | null {
  const agents = asObjects(resource['agent']);
  const agent = agents.find((candidate) => candidate['requestor'] === true) ?? agents[0];
  if (agent === undefined) {
    return null;
  }
  const who = asObject(agent['who']);
  const user = asString(asObject(who?.['identifier'])?.['value']) ?? asString(who?.['reference']) ?? asString(agent['altId']);
  return fit(user, USER_ID_MAX);
}

interface JournalResource {
  readonly resourceType: string | null;
  readonly resourceId: string | null;
}

/** The first relative FHIR reference wins; an `auth.user` account is the fallback (no FHIR resource touched). */
function resourceOf(entities: ReadonlyArray<Json>): JournalResource {
  for (const entity of entities) {
    const match = RELATIVE_REFERENCE.exec(asString(asObject(entity['what'])?.['reference']) ?? '');
    if (match?.[1] !== undefined && match[2] !== undefined) {
      return { resourceType: match[1], resourceId: match[2] };
    }
  }
  const accountId = authUserIdOf(entities);
  return accountId === undefined
    ? { resourceType: null, resourceId: null }
    : { resourceType: AUTH_USER_RESOURCE_TYPE, resourceId: accountId };
}

function authUserIdOf(entities: ReadonlyArray<Json>): string | undefined {
  for (const entity of entities) {
    const identifier = asObject(asObject(entity['what'])?.['identifier']);
    const value = asString(identifier?.['value']);
    if (asString(identifier?.['system']) === AUTH_USER_IDENTIFIER_SYSTEM && value !== undefined && FHIR_ID.test(value)) {
      return value;
    }
  }
  return undefined;
}

function requestIdOf(entities: ReadonlyArray<Json>): string | null {
  return fit(rawRequestIdOf(entities), REQUEST_ID_MAX);
}

function rawRequestIdOf(entities: ReadonlyArray<Json>): string | undefined {
  for (const entity of entities) {
    if (asString(asObject(entity['type'])?.['code']) === REQUEST_ID_ENTITY_TYPE) {
      const value = asString(asObject(asObject(entity['what'])?.['identifier'])?.['value']);
      if (value !== undefined) {
        return value;
      }
    }
    const detail = asObjects(entity['detail']).find((item) => REQUEST_ID_DETAIL_TYPES.has(asString(item['type']) ?? ''));
    const value = asString(detail?.['valueString']);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function sourceOf(resource: FhirResource): string | null {
  const observer = asObject(asObject(resource['source'])?.['observer']);
  return fit(asString(observer?.['display']) ?? asString(observer?.['reference']), SOURCE_MAX);
}

/** The doctor's free-text reason of an emergency bypass (`purposeOfEvent.text`); only that event carries it. */
function reasonOf(resource: FhirResource, action: AuditAction): string | null {
  return action === 'emergency-bypass' ? fit(asString(asObjects(resource['purposeOfEvent']).map((purpose) => asString(purpose['text'])).find((text) => text !== undefined)), REASON_MAX) : null;
}

/**
 * FHIR R4 `AuditEvent` → journal row (API §9.4). Returns `undefined` for
 * anything that is not a write or patient-data-read AuditEvent with a FHIR id and a
 * valid `recorded` instant — such entries are not part of the journal. An emergency consent bypass is journalled as
 * `emergency-bypass` with its reason (ADR-019). A read of
 * patient data (`read`/`search-type`) is journalled as `read` or, when refused, `denied` (ADR-018).
 *
 * Every text field is bounded to its column: one oversized value from HAPI
 * (an external source) must not reject a whole insert page and freeze the sync.
 */
export function toAuditEventRow(resource: FhirResource): AuditEventRow | undefined {
  const occurredAt = new Date(asString(resource['recorded']) ?? '');
  const action = actionOf(resource);
  const id = resource.id;
  if (resource.resourceType !== 'AuditEvent' || id === undefined || !FHIR_ID.test(id) || action === undefined || Number.isNaN(occurredAt.getTime())) {
    return undefined;
  }
  const entities = asObjects(resource['entity']);
  return {
    id,
    occurredAt,
    userId: userIdOf(resource),
    action,
    ...resourceOf(entities),
    requestId: requestIdOf(entities),
    source: sourceOf(resource),
    reason: reasonOf(resource, action),
  };
}

/** `meta.lastUpdated` of a HAPI resource, the sync cursor dimension. */
export function lastUpdatedOf(resource: FhirResource): Date | undefined {
  const value = asString(asObject(resource['meta'])?.['lastUpdated']);
  const instant = new Date(value ?? '');
  return Number.isNaN(instant.getTime()) ? undefined : instant;
}
