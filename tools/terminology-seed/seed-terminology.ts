import atcSnapshot from './snapshot/atc.json';
import icd10Snapshot from './snapshot/icd-10.json';
import observationsSnapshot from './snapshot/observations.json';
import servicesSnapshot from './snapshot/services.json';

/**
 * Local R4 terminology seed (ADR-002/ADR-016, risk R-1): ships a versioned
 * in-repo snapshot of the NSI CISZ / ATC / ICD-10 vocabularies and POSTs them
 * to HAPI preserving the `https://fhir.by/...` canonical URLs, so the stack
 * boots without access to the closed ЦИСЗ perimeter.
 */

export interface SeedConcept {
  readonly code: string;
  readonly display: string;
}

export interface SeedCodeSystem {
  readonly url: string;
  readonly version: string;
  readonly name: string;
  readonly status: 'active';
  readonly content: 'complete' | 'example';
  readonly caseSensitive: boolean;
  readonly concept: readonly SeedConcept[];
}

export interface SeedValueSet {
  readonly url: string;
  readonly version: string;
  readonly name: string;
  readonly status: 'active';
  readonly compose: {
    readonly include: ReadonlyArray<{ readonly system: string }>;
  };
}

export function buildCodeSystems(): SeedCodeSystem[] {
  return [
    {
      url: 'https://fhir.by/CodeSystem/nsi-services',
      version: '1.4.463',
      name: 'НСИ ЦИСЗ — услуги',
      status: 'active',
      content: 'complete',
      caseSensitive: false,
      concept: servicesSnapshot.map((c) => ({ code: c.code, display: c.display })),
    },
    {
      url: 'https://fhir.by/CodeSystem/nsi-observations',
      version: '1.4.463',
      name: 'НСИ ЦИСЗ — исследования',
      status: 'active',
      content: 'complete',
      caseSensitive: true,
      concept: observationsSnapshot.map((c) => ({ code: c.code, display: c.display })),
    },
    {
      url: 'http://www.whocc.no/atc',
      version: '2024',
      name: 'АТХ (ATC)',
      status: 'active',
      content: 'example',
      caseSensitive: true,
      concept: atcSnapshot.map((c) => ({ code: c.code, display: c.display })),
    },
    {
      url: 'https://fhir.by/CodeSystem/InternClassificDiseases10',
      version: '2024',
      name: 'МКБ-10 (адапт. МЗ РБ)',
      status: 'active',
      content: 'complete',
      caseSensitive: true,
      concept: icd10Snapshot.map((c) => ({ code: c.code, display: c.display })),
    },
  ];
}

export function buildValueSets(): SeedValueSet[] {
  return [
    {
      url: 'https://fhir.by/ValueSet/InternClassificDiseases10',
      version: '2024',
      name: 'МКБ-10 ValueSet',
      status: 'active',
      compose: {
        include: [{ system: 'https://fhir.by/CodeSystem/InternClassificDiseases10' }],
      },
    },
  ];
}

const FHIR_JSON_HEADERS = { 'content-type': 'application/fhir+json' };

async function postResource(
  baseUrl: string,
  resourceType: 'CodeSystem' | 'ValueSet',
  resource: SeedCodeSystem | SeedValueSet,
): Promise<void> {
  // Create happens on the resource-type endpoint; HAPI rejects a bare base URL
  // and every FHIR JSON body must carry `resourceType`.
  const response = await fetch(`${baseUrl}/${resourceType}`, {
    method: 'POST',
    headers: FHIR_JSON_HEADERS,
    body: JSON.stringify({ resourceType, ...resource }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FHIR POST ${baseUrl}/${resourceType} failed with ${response.status}: ${body.slice(0, 500)}`);
  }
}

async function verifyIcd10Expansion(baseUrl: string): Promise<void> {
  const url = new URL(`${baseUrl}/ValueSet/$expand`);
  url.searchParams.set('url', 'https://fhir.by/ValueSet/InternClassificDiseases10');
  url.searchParams.set('count', '1');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ValueSet $expand failed with ${response.status}`);
  }
  const expansion = (await response.json()) as { total?: number };
  console.log(`ICD-10 ValueSet expansion total: ${expansion.total ?? 0}`);
}

/** Posts every CodeSystem/ValueSet to HAPI, then proves the canonical survived via $expand. */
export async function seedTerminology(baseUrl: string): Promise<void> {
  for (const codeSystem of buildCodeSystems()) {
    await postResource(baseUrl, 'CodeSystem', codeSystem);
    console.log(`Seeded CodeSystem ${codeSystem.url}`);
  }
  for (const valueSet of buildValueSets()) {
    await postResource(baseUrl, 'ValueSet', valueSet);
    console.log(`Seeded ValueSet ${valueSet.url}`);
  }
  await verifyIcd10Expansion(baseUrl);
}

if (require.main === module) {
  const baseUrl = process.env['FHIR_BASE_URL'] ?? 'http://localhost:8080/fhir';
  seedTerminology(baseUrl).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
