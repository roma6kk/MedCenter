import { FHIR_RESOURCE_ID_SYSTEM, type FhirResource } from '@medcenter/fhir';

import type { AuditAction } from '../../database/entities/audit-event-read.entity';
import type { AuditEventRow } from './audit.repository';

type Json = Readonly<Record<string, unknown>>;

const ACTION_BY_CODE: Readonly<Record<string, AuditAction>> = { C: 'create', U: 'update', D: 'delete' };
const WRITE_SUBTYPES: ReadonlySet<string> = new Set(['create', 'update', 'delete']);
const READ_SUBTYPES: ReadonlySet<string> = new Set(['read', 'search-type']);
const OUTCOME_MINOR_FAILURE = '4';
const BYPASS_SUBTYPE = 'consent-emergency-bypass';

const REQUEST_ID_ENTITY_TYPE = 'XrequestId';
const REQUEST_ID_DETAIL_TYPES: ReadonlySet<string> = new Set(['requestId', 'x-request-id', 'X-Request-Id']);

// Column widths of analytics.audit_event: HAPI is external, nothing may overflow them.
const USER_ID_MAX = 128;
const REQUEST_ID_MAX = 128;
const SOURCE_MAX = 128;
const REASON_MAX = 500;

const FHIR_ID = /^[A-Za-z0-9\-.]{1,64}$/;
const RELATIVE_REFERENCE = /^([A-Z][A-Za-z]{1,63})\/([A-Za-z0-9\-.]{1,64})(\/_history\/[A-Za-z0-9\-.]{1,64})?$/;

// auth.user accounts have no FHIR resource: auth-service files them as an entity.what.identifier of its own system; shown as AuthUser/{id}.
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

// NUL is stripped: PostgreSQL text columns reject it (22021).
function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const text = value.split('\u0000').join('');
  return text.length > 0 ? text : undefined;
}

function fit(value: string | undefined, max: number): string | null {
  return value === undefined ? null : value.slice(0, max);
}

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

// A logical reference (type + identifier): a literal Type/id would keep HAPI from deleting an admin-deletable resource.
function logicalReferenceOf(what: Json | undefined): JournalResource | undefined {
  const identifier = asObject(what?.['identifier']);
  const type = asString(what?.['type']);
  const id = asString(identifier?.['value']);
  if (asString(identifier?.['system']) !== FHIR_RESOURCE_ID_SYSTEM || type === undefined || id === undefined) {
    return undefined;
  }
  return RELATIVE_REFERENCE.test(`${type}/${id}`) ? { resourceType: type, resourceId: id } : undefined;
}

function resourceOf(entities: ReadonlyArray<Json>): JournalResource {
  for (const entity of entities) {
    const what = asObject(entity['what']);
    const match = RELATIVE_REFERENCE.exec(asString(what?.['reference']) ?? '');
    if (match?.[1] !== undefined && match[2] !== undefined) {
      return { resourceType: match[1], resourceId: match[2] };
    }
    const logical = logicalReferenceOf(what);
    if (logical !== undefined) {
      return logical;
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

function requestIdOf(entities: ReadonlyArray<Json>): string | undefined {
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

function reasonOf(resource: FhirResource, action: AuditAction): string | null {
  if (action !== 'emergency-bypass') {
    return null;
  }
  const texts = asObjects(resource['purposeOfEvent']).map((purpose) => asString(purpose['text']));
  return fit(texts.find((text) => text !== undefined), REASON_MAX);
}

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
    requestId: fit(requestIdOf(entities), REQUEST_ID_MAX),
    source: sourceOf(resource),
    reason: reasonOf(resource, action),
  };
}

export function lastUpdatedOf(resource: FhirResource): Date | undefined {
  const value = asString(asObject(resource['meta'])?.['lastUpdated']);
  const instant = new Date(value ?? '');
  return Number.isNaN(instant.getTime()) ? undefined : instant;
}
