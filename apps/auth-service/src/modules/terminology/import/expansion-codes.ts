import type { FhirResource } from '@medcenter/fhir';

/** Reading of `ValueSet.expansion`: which codes a `$expand` answer really carries. */

interface ExpansionNode {
  readonly code?: unknown;
  readonly contains?: unknown;
}

function collectCodes(nodes: unknown, into: Set<string>): void {
  if (!Array.isArray(nodes)) {
    return;
  }
  for (const node of nodes as readonly ExpansionNode[]) {
    if (typeof node.code === 'string') {
      into.add(node.code);
    }
    collectCodes(node.contains, into);
  }
}

/** Codes of `ValueSet.expansion.contains`, including nested (hierarchical) entries. */
export function expansionCodes(valueSet: FhirResource): ReadonlySet<string> {
  const codes = new Set<string>();
  const expansion = valueSet['expansion'] as { contains?: unknown } | undefined;
  collectCodes(expansion?.contains, codes);
  return codes;
}

/** The expected codes the expansion did not return. */
export function findMissingCodes(valueSet: FhirResource, expectedCodes: readonly string[]): string[] {
  const returned = expansionCodes(valueSet);
  return expectedCodes.filter((code) => !returned.has(code));
}
