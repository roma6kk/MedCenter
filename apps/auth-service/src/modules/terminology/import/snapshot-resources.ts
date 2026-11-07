import type { FhirResource } from '@medcenter/fhir';

import { SEEDED_URLS } from '../seeded-value-sets';
import atcSnapshot from './snapshot/atc.json';
import icd10Snapshot from './snapshot/icd-10.json';
import observationsSnapshot from './snapshot/observations.json';
import servicesSnapshot from './snapshot/services.json';
import ucumSnapshot from './snapshot/ucum.json';

export const SNAPSHOT_VERSION = '1.4.463';

export interface SnapshotConcept {
  readonly code: string;
  readonly display: string;
}

export interface SnapshotCodeSystem extends FhirResource {
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
  readonly concept: readonly SnapshotConcept[];
}

export interface SnapshotValueSetInclude {
  readonly system: string;
  readonly concept?: readonly SnapshotConcept[];
}

export interface SnapshotValueSet extends FhirResource {
  readonly resourceType: 'ValueSet';
  readonly id: string;
  readonly url: string;
  readonly version: string;
  readonly name: string;
  readonly title: string;
  readonly status: 'active';
  readonly experimental: false;
  readonly compose: { readonly include: readonly SnapshotValueSetInclude[] };
}

interface SnapshotDefinition {
  readonly key: string;
  readonly systemUrl: string;
  readonly valueSetUrl: string;
  readonly version: string;
  readonly name: string;
  readonly title: string;
  readonly caseSensitive: boolean;
  readonly concepts: readonly SnapshotConcept[];
  readonly publishesCodeSystem: boolean;
}

function toConcepts(snapshot: ReadonlyArray<{ code: string; display: string }>): SnapshotConcept[] {
  return snapshot.map(({ code, display }) => ({ code, display }));
}

const DEFINITIONS: readonly SnapshotDefinition[] = [
  {
    key: 'nsi-services',
    systemUrl: SEEDED_URLS.SERVICE_CODE_SYSTEM,
    valueSetUrl: SEEDED_URLS.SERVICE_VALUE_SET,
    version: SNAPSHOT_VERSION,
    name: 'NsiServices',
    title: 'НСИ ЦИСЗ — услуги',
    caseSensitive: false,
    concepts: toConcepts(servicesSnapshot),
    publishesCodeSystem: true,
  },
  {
    key: 'nsi-observations',
    systemUrl: SEEDED_URLS.OBSERVATION_CODE_SYSTEM,
    valueSetUrl: SEEDED_URLS.OBSERVATION_VALUE_SET,
    version: SNAPSHOT_VERSION,
    name: 'NsiObservations',
    title: 'НСИ ЦИСЗ — исследования',
    caseSensitive: true,
    concepts: toConcepts(observationsSnapshot),
    publishesCodeSystem: true,
  },
  {
    key: 'atc',
    systemUrl: SEEDED_URLS.ATC_CODE_SYSTEM,
    valueSetUrl: SEEDED_URLS.ATC_VALUE_SET,
    version: '2024',
    name: 'Atc',
    title: 'АТХ (ATC)',
    caseSensitive: true,
    concepts: toConcepts(atcSnapshot),
    publishesCodeSystem: true,
  },
  {
    key: 'icd10',
    systemUrl: SEEDED_URLS.ICD10_CODE_SYSTEM,
    valueSetUrl: SEEDED_URLS.ICD10_VALUE_SET,
    version: '2024',
    name: 'InternClassificDiseases10',
    title: 'МКБ-10 (адапт. МЗ РБ)',
    caseSensitive: true,
    concepts: toConcepts(icd10Snapshot),
    publishesCodeSystem: true,
  },
  {
    key: 'ucum',
    systemUrl: SEEDED_URLS.UCUM_SYSTEM,
    valueSetUrl: SEEDED_URLS.UCUM_VALUE_SET,
    version: '2024',
    name: 'UcumUnits',
    title: 'Единицы измерения UCUM (закрытый перечень, BR-009)',
    caseSensitive: true,
    concepts: toConcepts(ucumSnapshot),
    publishesCodeSystem: false,
  },
];

export function buildCodeSystems(): SnapshotCodeSystem[] {
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

export function buildValueSets(): SnapshotValueSet[] {
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
  readonly systemUrl: string;
  readonly concepts: readonly SnapshotConcept[];
  readonly expectedCodes: readonly string[];
}

export function buildExpansionChecks(): ExpansionCheck[] {
  return DEFINITIONS.map((definition) => ({
    valueSetUrl: definition.valueSetUrl,
    systemUrl: definition.systemUrl,
    concepts: definition.concepts,
    expectedCodes: definition.concepts.map((concept) => concept.code),
  }));
}
