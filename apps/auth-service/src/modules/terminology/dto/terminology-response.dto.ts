export interface ValueSetSummaryDto {
  readonly url: string;
  readonly name?: string;
  readonly title?: string;
  readonly version?: string;
  readonly status?: string;
}

export interface ConceptDto {
  readonly system: string;
  readonly code: string;
  readonly display?: string;
}

export interface ExpansionResponseDto {
  readonly valueSet: string;
  readonly total: number;
  readonly items: ReadonlyArray<ConceptDto>;
}

export interface ValidationResponseDto {
  readonly system: string;
  readonly code: string;
  readonly valid: boolean;
  readonly display?: string;
}
