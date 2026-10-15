import type { FhirResource, FhirSearchResult } from '@medcenter/fhir';

import type { ConceptDto, ValueSetSummaryDto } from './dto/terminology-response.dto';
import { FHIR_BY_VALUE_SET_PREFIX } from './seeded-value-sets';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOf(source: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function records(value: unknown): ReadonlyArray<Readonly<Record<string, unknown>>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function toSummary(resource: FhirResource): ValueSetSummaryDto | null {
  const url = textOf(resource, 'url');
  if (url === undefined || !url.startsWith(FHIR_BY_VALUE_SET_PREFIX)) {
    return null;
  }
  const optional = (key: string): { readonly [field: string]: string } => {
    const value = textOf(resource, key);
    return value === undefined ? {} : { [key]: value };
  };
  return { url, ...optional('name'), ...optional('title'), ...optional('version'), ...optional('status') };
}

/** The `fhir.by` ValueSets of a search Bundle, ordered by canonical; anything else HAPI holds is not ours. */
export function toValueSetSummaries(result: FhirSearchResult): ValueSetSummaryDto[] {
  return (result.entry ?? [])
    .map((entry) => toSummary(entry.resource))
    .filter((summary): summary is ValueSetSummaryDto => summary !== null)
    .sort((left, right) => left.url.localeCompare(right.url));
}

function collectConcepts(nodes: unknown, into: ConceptDto[]): void {
  for (const node of records(nodes)) {
    const system = textOf(node, 'system');
    const code = textOf(node, 'code');
    // `abstract` grouping nodes carry no code; their children are still listed.
    if (system !== undefined && code !== undefined) {
      const display = textOf(node, 'display');
      into.push({ system, code, ...(display !== undefined ? { display } : {}) });
    }
    collectConcepts(node['contains'], into);
  }
}

/** Flattens `ValueSet.expansion.contains` (which may nest) into concepts plus the server's total. */
export function toConcepts(valueSet: FhirResource): { readonly total: number; readonly items: ConceptDto[] } {
  const expansion = isRecord(valueSet['expansion']) ? valueSet['expansion'] : {};
  const items: ConceptDto[] = [];
  collectConcepts(expansion['contains'], items);
  const total = expansion['total'];
  return { total: typeof total === 'number' && Number.isInteger(total) && total >= 0 ? total : items.length, items };
}

/** `Parameters` of `ValueSet/$validate-code`: `result` (boolean) and the resolved `display`. */
export function toValidation(parameters: FhirResource): { readonly valid: boolean; readonly display?: string } {
  const list = records(parameters['parameter']);
  const result = list.find((parameter) => parameter['name'] === 'result');
  const display = textOf(list.find((parameter) => parameter['name'] === 'display') ?? {}, 'valueString');
  return { valid: result?.['valueBoolean'] === true, ...(display !== undefined ? { display } : {}) };
}
