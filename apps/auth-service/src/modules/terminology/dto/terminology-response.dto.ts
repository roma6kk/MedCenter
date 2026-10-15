/** One row of `GET /api/v1/terminology/value-sets` (API 2.3.1). */
export interface ValueSetSummaryDto {
  /** Canonical `https://fhir.by/ValueSet/...`. */
  readonly url: string;
  readonly name?: string;
  readonly title?: string;
  readonly version?: string;
  readonly status?: string;
}

/** An expanded concept (R4 `ValueSet.expansion.contains`). */
export interface ConceptDto {
  readonly system: string;
  readonly code: string;
  readonly display?: string;
}

/** API 2.3.2: the page of an expansion; `total` counts the whole (filtered) ValueSet. */
export interface ExpansionResponseDto {
  readonly valueSet: string;
  readonly total: number;
  readonly items: ReadonlyArray<ConceptDto>;
}

/** API 2.3.3: whether a `system|code` pair is in the seeded ValueSet of its system. */
export interface ValidationResponseDto {
  readonly system: string;
  readonly code: string;
  readonly valid: boolean;
  readonly display?: string;
}
