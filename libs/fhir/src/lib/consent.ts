import {
  CONSENT_CODE_SYSTEMS,
  CONSENT_CODES,
  CONSENT_POLICY_RULE_TEXT,
  MEDCENTER_EXT,
} from '@medcenter/terminology';
import {
  CONSENTER_TYPES,
  CONSENT_STATUSES,
  type ConsenterType,
  type ConsentResponse,
  type ConsentStatus,
} from '@medcenter/contracts';

import type { FhirResource } from './fhir-client.provider';

/** Everything the paper form says; the service adds only the ids it has verified (ADR-019). */
export interface BuildConsentParams {
  readonly patientId: string;
  /** `active` for a signed consent, `rejected` for a written refusal. */
  readonly status: 'active' | 'rejected';
  readonly formNumber: string;
  /** Moment of signing (`date` or `dateTime`), not the moment of entry. */
  readonly signedAt: string;
  /** `Patient/{id}` or `RelatedPerson/{id}` — who signed. */
  readonly performerRef: string;
  readonly consenterType: ConsenterType;
  readonly representativeDocument?: string;
  /** The medical worker who signed the form: `Consent.note.author*`, never an extension. */
  readonly signer: { readonly reference?: string; readonly name?: string };
  readonly scan: {
    readonly binaryId: string;
    readonly contentType: string;
    readonly hash: string;
    readonly title?: string;
  };
}

const SCAN_TITLE = 'Согласие на внесение сведений в электронную медкарту';
const SIGNER_NOTE_TEXT = 'Подпись медицинского работника на бумажной форме';

type Json = Readonly<Record<string, unknown>>;

function asObject(value: unknown): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : undefined;
}

function asObjects(value: unknown): ReadonlyArray<Json> {
  return Array.isArray(value)
    ? (value as unknown[]).flatMap((item): Json[] => {
        const object = asObject(item);
        return object === undefined ? [] : [object];
      })
    : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** FHIR R4 `Consent` of a paper consent or refusal (design §2.1). */
export function buildConsent(params: BuildConsentParams): FhirResource {
  const { signer, scan } = params;
  const extension = [
    { url: MEDCENTER_EXT.CONSENT_CONSENTER_TYPE, valueCode: params.consenterType },
    ...(params.representativeDocument === undefined
      ? []
      : [
          {
            url: MEDCENTER_EXT.CONSENT_REPRESENTATIVE_DOCUMENT,
            valueString: params.representativeDocument,
          },
        ]),
  ];
  return {
    resourceType: 'Consent',
    extension,
    identifier: [{ system: CONSENT_CODE_SYSTEMS.FORM_NUMBER, value: params.formNumber }],
    status: params.status,
    scope: {
      coding: [{ system: CONSENT_CODE_SYSTEMS.SCOPE, code: CONSENT_CODES.SCOPE_PATIENT_PRIVACY }],
    },
    category: [
      {
        coding: [
          {
            system: CONSENT_CODE_SYSTEMS.LOINC,
            code: CONSENT_CODES.LOINC_CONSENT_DOCUMENT,
            display: 'Consent Document',
          },
        ],
      },
      {
        coding: [
          { system: CONSENT_CODE_SYSTEMS.CATEGORY, code: CONSENT_CODES.CATEGORY_EMR_PROCESSING },
        ],
      },
    ],
    patient: { reference: `Patient/${params.patientId}` },
    dateTime: params.signedAt,
    performer: [{ reference: params.performerRef }],
    sourceAttachment: {
      contentType: scan.contentType,
      title: scan.title ?? SCAN_TITLE,
      url: `Binary/${scan.binaryId}`,
      hash: scan.hash,
      creation: params.signedAt,
    },
    policyRule: { text: CONSENT_POLICY_RULE_TEXT },
    provision: {
      type: params.status === 'active' ? 'permit' : 'deny',
      period: { start: params.signedAt },
    },
    note: [
      {
        ...(signer.reference === undefined
          ? {}
          : { authorReference: { reference: signer.reference } }),
        ...(signer.name === undefined ? {} : { authorString: signer.name }),
        time: new Date().toISOString(),
        text: SIGNER_NOTE_TEXT,
      },
    ],
  };
}

/**
 * The same `Consent` after a revocation (design §2.2): `inactive`, the period
 * closed at `revokedAt`. The document keeps its form, scan and signer; HAPI's
 * version history keeps the previous state. Nothing is deleted.
 */
export function revokeConsent(
  consent: FhirResource,
  revocation: { readonly revokedAt: string; readonly applicationNumber?: string },
): FhirResource {
  const provision = asObject(consent['provision']) ?? { type: 'permit' };
  const period = asObject(provision['period']) ?? {};
  const kept = asObjects(consent['extension']).filter(
    (item) => item['url'] !== MEDCENTER_EXT.CONSENT_REVOCATION_NUMBER,
  );
  return {
    ...consent,
    status: 'inactive',
    provision: { ...provision, period: { ...period, end: revocation.revokedAt } },
    extension: [
      ...kept,
      ...(revocation.applicationNumber === undefined
        ? []
        : [
            {
              url: MEDCENTER_EXT.CONSENT_REVOCATION_NUMBER,
              valueString: revocation.applicationNumber,
            },
          ]),
    ],
  };
}

function referenceParts(
  reference: unknown,
): { readonly type: string; readonly id: string } | undefined {
  const match =
    /(?:^|\/)([A-Z][A-Za-z]+)\/([A-Za-z0-9\-.]{1,64})(?:\/_history\/[A-Za-z0-9\-.]{1,64})?$/.exec(
      asString(reference) ?? '',
    );
  return match?.[1] === undefined || match[2] === undefined
    ? undefined
    : { type: match[1], id: match[2] };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function instantOf(value: unknown): number | undefined {
  const text = asString(value);
  const time = text === undefined ? Number.NaN : new Date(text).getTime();
  return Number.isNaN(time) ? undefined : time;
}

/** A date-only `period.end` is inclusive: the consent holds through that day. */
function endInstantOf(value: unknown): number | undefined {
  const time = instantOf(value);
  return time !== undefined && DATE_ONLY.test(asString(value) ?? '') ? time + DAY_MS : time;
}

function hasCoding(concepts: unknown, system: string, code: string): boolean {
  return asObjects(concepts).some((concept) =>
    asObjects(concept['coding']).some(
      (coding) => coding['system'] === system && coding['code'] === code,
    ),
  );
}

/**
 * Whether `resource` is an `emr-processing` consent of `patientId` that holds
 * at `now`. It re-checks every searched field in process, so a HAPI that
 * silently ignores a search parameter can never widen the answer, and it
 * judges the period itself instead of trusting `status` alone (design §2.3).
 */
export function isConsentInForce(resource: FhirResource, patientId: string, now: Date): boolean {
  if (resource.resourceType !== 'Consent' || resource['status'] !== 'active') {
    return false;
  }
  const patient = referenceParts(asObject(resource['patient'])?.['reference']);
  if (patient?.type !== 'Patient' || patient.id !== patientId) {
    return false;
  }
  if (
    !hasCoding([resource['scope']], CONSENT_CODE_SYSTEMS.SCOPE, CONSENT_CODES.SCOPE_PATIENT_PRIVACY)
  ) {
    return false;
  }
  if (
    !hasCoding(
      resource['category'],
      CONSENT_CODE_SYSTEMS.CATEGORY,
      CONSENT_CODES.CATEGORY_EMR_PROCESSING,
    )
  ) {
    return false;
  }
  const provision = asObject(resource['provision']);
  if (provision?.['type'] !== 'permit') {
    return false;
  }
  const period = asObject(provision['period']);
  const start = instantOf(period?.['start']);
  const end = endInstantOf(period?.['end']);
  return (
    (start === undefined || start <= now.getTime()) && (end === undefined || end > now.getTime())
  );
}

function isOneOf<T extends string>(values: ReadonlyArray<T>, value: unknown): value is T {
  return typeof value === 'string' && (values as ReadonlyArray<string>).includes(value);
}

function extensionValue(resource: FhirResource, url: string): string | undefined {
  const found = asObjects(resource['extension']).find((item) => item['url'] === url);
  return asString(found?.['valueString']) ?? asString(found?.['valueCode']);
}

function signedByOf(resource: FhirResource): string | undefined {
  for (const note of asObjects(resource['note'])) {
    const name =
      asString(note['authorString']) ?? asString(asObject(note['authorReference'])?.['reference']);
    if (name !== undefined) {
      return name;
    }
  }
  return undefined;
}

function scanOf(resource: FhirResource): ConsentResponse['scan'] {
  const attachment = asObject(resource['sourceAttachment']);
  const reference = referenceParts(attachment?.['url']);
  const contentType = asString(attachment?.['contentType']);
  const hash = asString(attachment?.['hash']);
  return reference?.type === 'Binary' && contentType !== undefined && hash !== undefined
    ? { id: reference.id, contentType, hash }
    : undefined;
}

/** `Consent` → response contract of 3.4/3.7/3.8/3.9 (`performer` falls back to the patient when absent). */
export function toConsentResponse(resource: FhirResource): ConsentResponse {
  const patient = referenceParts(asObject(resource['patient'])?.['reference']);
  const performer =
    referenceParts(asObject(asObjects(resource['performer'])[0])?.['reference']) ?? patient;
  const status: ConsentStatus = isOneOf(CONSENT_STATUSES, resource['status'])
    ? resource['status']
    : 'entered-in-error';
  const consenterType = extensionValue(resource, MEDCENTER_EXT.CONSENT_CONSENTER_TYPE);
  const period = asObject(asObject(resource['provision'])?.['period']);
  const start = asString(period?.['start']);
  const end = asString(period?.['end']);
  const formNumber = asString(
    asObjects(resource['identifier']).find(
      (item) => item['system'] === CONSENT_CODE_SYSTEMS.FORM_NUMBER,
    )?.['value'],
  );
  const signedBy = signedByOf(resource);
  const representativeDocument = extensionValue(
    resource,
    MEDCENTER_EXT.CONSENT_REPRESENTATIVE_DOCUMENT,
  );
  const revocationNumber = extensionValue(resource, MEDCENTER_EXT.CONSENT_REVOCATION_NUMBER);
  const scan = scanOf(resource);
  const recordedAt = asString(asObject(resource['meta'])?.['lastUpdated']);
  return {
    id: resource.id ?? '',
    status,
    ...(formNumber === undefined ? {} : { formNumber }),
    signedAt: asString(resource['dateTime']) ?? '',
    ...(isOneOf(CONSENTER_TYPES, consenterType) ? { consenterType } : {}),
    performer: {
      type: performer?.type === 'RelatedPerson' ? 'RelatedPerson' : 'Patient',
      id: performer?.id ?? '',
    },
    ...(signedBy === undefined ? {} : { signedBy }),
    ...(representativeDocument === undefined ? {} : { representativeDocument }),
    ...(scan === undefined ? {} : { scan }),
    period: { ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) },
    ...(revocationNumber === undefined ? {} : { revocationNumber }),
    ...(recordedAt === undefined ? {} : { recordedAt }),
  };
}
