import { FHIR_BY } from '../../libs/terminology/src/lib/canonical-urls';
import type { FhirResource } from '../shared/fhir-http';
import atcSnapshot from './snapshot/atc.json';
import icd10Snapshot from './snapshot/icd-10.json';
import observationsSnapshot from './snapshot/observations.json';
import servicesSnapshot from './snapshot/services.json';
import ucumSnapshot from './snapshot/ucum.json';

/**
 * Pure R4 builders for the versioned terminology snapshot (ADR-002/ADR-016,
 * risk R-1). Canonical URLs stay `https://fhir.by/...` (international ones —
 * ATC, UCUM — keep their HL7-registered canonicals), and every resource carries
 * a deterministic id so the seed can `PUT` it idempotently.
 *
 * `content: 'fragment'` is deliberate: the snapshot is a curated *subset* of
 * МКБ-10 / АТХ / НСИ ЦИСЗ, which is exactly what R4 `fragment` means. It also
 * keeps HAPI on its in-memory expansion path — a `complete` CodeSystem is
 * indexed into HAPI's terminology tables, whose `$expand` needs Hibernate
 * Search, and the compose HAPI runs with Hibernate Search disabled.
 */

/** ValueSet canonicals the seed publishes. `FHIR_BY` only declares the ICD-10 one so far. */
export const TERMINOLOGY_URLS = {
  ICD10_CODE_SYSTEM: 'https://fhir.by/CodeSystem/InternClassificDiseases10',
  ICD10_VALUE_SET: FHIR_BY.ICD10_VALUE_SET,
  ATC_CODE_SYSTEM: FHIR_BY.ATC_CODE_SYSTEM,
  ATC_VALUE_SET: 'https://fhir.by/ValueSet/atc',
  UCUM_SYSTEM: FHIR_BY.UCUM_SYSTEM,
  UCUM_VALUE_SET: 'https://fhir.by/ValueSet/ucum-units',
  SERVICE_CODE_SYSTEM: FHIR_BY.SERVICE_CODE_SYSTEM,
  SERVICE_VALUE_SET: 'https://fhir.by/ValueSet/nsi-services',
  OBSERVATION_CODE_SYSTEM: FHIR_BY.OBSERVATION_CODE_SYSTEM,
  OBSERVATION_VALUE_SET: 'https://fhir.by/ValueSet/nsi-observations',
} as const;

export interface SeedConcept {
  readonly code: string;
  readonly display: string;
}

export interface SeedCodeSystem extends FhirResource {
  readonly resourceType: 'CodeSystem';
  readonly id: string;
  readonly url: string;
  readonly version: string;
  readonly name: string;
  readonly title: string;
  readonly status: 'active';
  readonly experimental: false;
  readonly content: 'fragment';
  readonly caseSensitive: boolean;
  readonly concept: readonly SeedConcept[];
}

export interface SeedValueSetInclude {
  readonly system: string;
  readonly concept?: readonly SeedConcept[];
}

export interface SeedValueSet extends FhirResource {
  readonly resourceType: 'ValueSet';
  readonly id: string;
  readonly url: string;
  readonly version: string;
  readonly name: string;
  readonly title: string;
  readonly status: 'active';
  readonly experimental: false;
  readonly compose: { readonly include: readonly SeedValueSetInclude[] };
}

interface TerminologyDefinition {
  readonly key: string;
  readonly systemUrl: string;
  readonly valueSetUrl: string;
  readonly version: string;
  readonly name: string;
  readonly title: string;
  readonly caseSensitive: boolean;
  readonly concepts: readonly SeedConcept[];
  /** `false` for UCUM: an external grammar-based system is never re-published as a CodeSystem. */
  readonly publishesCodeSystem: boolean;
}

function toConcepts(snapshot: ReadonlyArray<{ code: string; display: string }>): SeedConcept[] {
  return snapshot.map(({ code, display }) => ({ code, display }));
}

const DEFINITIONS: readonly TerminologyDefinition[] = [
  {
    key: 'nsi-services',
    systemUrl: TERMINOLOGY_URLS.SERVICE_CODE_SYSTEM,
    valueSetUrl: TERMINOLOGY_URLS.SERVICE_VALUE_SET,
    version: '1.4.463',
    name: 'NsiServices',
    title: 'НСИ ЦИСЗ — услуги',
    caseSensitive: false,
    concepts: toConcepts(servicesSnapshot),
    publishesCodeSystem: true,
  },
  {
    key: 'nsi-observations',
    systemUrl: TERMINOLOGY_URLS.OBSERVATION_CODE_SYSTEM,
    valueSetUrl: TERMINOLOGY_URLS.OBSERVATION_VALUE_SET,
    version: '1.4.463',
    name: 'NsiObservations',
    title: 'НСИ ЦИСЗ — исследования',
    caseSensitive: true,
    concepts: toConcepts(observationsSnapshot),
    publishesCodeSystem: true,
  },
  {
    key: 'atc',
    systemUrl: TERMINOLOGY_URLS.ATC_CODE_SYSTEM,
    valueSetUrl: TERMINOLOGY_URLS.ATC_VALUE_SET,
    version: '2024',
    name: 'Atc',
    title: 'АТХ (ATC)',
    caseSensitive: true,
    concepts: toConcepts(atcSnapshot),
    publishesCodeSystem: true,
  },
  {
    key: 'icd10',
    systemUrl: TERMINOLOGY_URLS.ICD10_CODE_SYSTEM,
    valueSetUrl: TERMINOLOGY_URLS.ICD10_VALUE_SET,
    version: '2024',
    name: 'InternClassificDiseases10',
    title: 'МКБ-10 (адапт. МЗ РБ)',
    caseSensitive: true,
    concepts: toConcepts(icd10Snapshot),
    publishesCodeSystem: true,
  },
  {
    key: 'ucum',
    systemUrl: TERMINOLOGY_URLS.UCUM_SYSTEM,
    valueSetUrl: TERMINOLOGY_URLS.UCUM_VALUE_SET,
    version: '2024',
    name: 'UcumUnits',
    title: 'Единицы измерения UCUM (закрытый перечень, BR-009)',
    caseSensitive: true,
    concepts: toConcepts(ucumSnapshot),
    publishesCodeSystem: false,
  },
];

export function buildCodeSystems(): SeedCodeSystem[] {
  return DEFINITIONS.filter((definition) => definition.publishesCodeSystem).map((definition) => ({
    resourceType: 'CodeSystem',
    id: `cs-${definition.key}`,
    url: definition.systemUrl,
    version: definition.version,
    name: definition.name,
    title: definition.title,
    status: 'active',
    experimental: false,
    content: 'fragment',
    caseSensitive: definition.caseSensitive,
    concept: definition.concepts,
  }));
}

export function buildValueSets(): SeedValueSet[] {
  return DEFINITIONS.map((definition) => ({
    resourceType: 'ValueSet',
    id: `vs-${definition.key}`,
    url: definition.valueSetUrl,
    version: definition.version,
    name: definition.name,
    title: definition.title,
    status: 'active',
    experimental: false,
    compose: {
      include: [
        definition.publishesCodeSystem
          ? { system: definition.systemUrl }
          : { system: definition.systemUrl, concept: definition.concepts },
      ],
    },
  }));
}

export interface ExpansionCheck {
  readonly valueSetUrl: string;
  /** The code system the ValueSet draws from (the `system` of `$validate-code`). */
  readonly systemUrl: string;
  readonly concepts: readonly SeedConcept[];
  readonly expectedCodes: readonly string[];
}

/**
 * Every snapshot code must come back from `$expand` of its ValueSet and be
 * accepted by `$validate-code` against it — the call the services' terminology
 * guards make (BR-004).
 */
export function buildExpansionChecks(): ExpansionCheck[] {
  return DEFINITIONS.map((definition) => ({
    valueSetUrl: definition.valueSetUrl,
    systemUrl: definition.systemUrl,
    concepts: definition.concepts,
    expectedCodes: definition.concepts.map((concept) => concept.code),
  }));
}
