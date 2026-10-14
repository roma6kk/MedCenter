import { Inject, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { FHIR_BY } from '@medcenter/terminology';

import { mapWithConcurrency } from '../../common/concurrency';
import { arrayField, isRecord, stringField } from '../../common/fhir/fhir-read';
import { ICD10_CODE_SYSTEM, SEEDED_VALUE_SETS, seededValueSetOf } from './seeded-terminology';

export { ICD10_CODE_SYSTEM, SEEDED_VALUE_SETS };

/** UCUM case-sensitive codes are printable ASCII without spaces; free text (`горсть`) never is. */
const UCUM_SYNTAX = /^[!-~]{1,20}$/;
/** HAPI answers an unknown ValueSet / code system with one of these instead of `result=false`. */
const NOT_FOUND_STATUSES: ReadonlySet<number> = new Set([400, 404, 422]);
const LOOKUP_CONCURRENCY = 6;

export interface TerminologyRef {
  readonly system: string;
  readonly code: string;
}

/** Display text resolved by the terminology server, keyed by {@link displayKey}. */
export type TerminologyDisplays = ReadonlyMap<string, string>;

interface CodeCheck {
  readonly isKnown: boolean;
  readonly display?: string;
}

export function displayKey(system: string, code: string): string {
  return `${system}|${code}`;
}

function parseValidateCode(result: FhirResource): CodeCheck {
  const parameters = arrayField(result, 'parameter').filter(isRecord);
  const outcome = parameters.find((parameter) => parameter['name'] === 'result');
  const display = parameters.find((parameter) => parameter['name'] === 'display');
  return { isKnown: outcome?.['valueBoolean'] === true, display: stringField(display, 'valueString') };
}

function uniqueRefs(refs: readonly TerminologyRef[]): TerminologyRef[] {
  const seen = new Map<string, TerminologyRef>();
  for (const ref of refs) {
    seen.set(displayKey(ref.system, ref.code), ref);
  }
  return [...seen.values()];
}

/** A ref that can never be in the seed: system outside it, or a unit that is not UCUM syntax. */
function isOutsideSeed(ref: TerminologyRef): boolean {
  if (seededValueSetOf(ref.system) === undefined) {
    return true;
  }
  return ref.system === FHIR_BY.UCUM_SYSTEM && !UCUM_SYNTAX.test(ref.code);
}

function collectDisplays(refs: readonly TerminologyRef[], checks: readonly CodeCheck[]): TerminologyDisplays {
  const displays = new Map<string, string>();
  refs.forEach((ref, index) => {
    const display = checks[index]?.display;
    if (display !== undefined) {
      displays.set(displayKey(ref.system, ref.code), display);
    }
  });
  return displays;
}

/**
 * Terminology gate of API §7.3 (BR-004, BR-009, ADR-002/016). The DTO grammar
 * (`@MatchesICD10`, `@MatchesATC`) is the first line; this service then checks
 * every code against the ValueSet the seed publishes for its system, through
 * `ValueSet/$validate-code` with the canonical `https://fhir.by/ValueSet/...` URL:
 * - ICD-10 → `InternClassificDiseases10`; a miss is `422 INVALID_ICD10_CODE`.
 *   Membership is strict: a seeded category (`J06`) does not admit an unseeded
 *   subcategory (`J06.8`).
 * - ATC, UCUM (closed unit list, BR-009) and НСИ codes → their `fhir.by`
 *   ValueSets; a miss — or a system the seed does not carry — is
 *   `422 TERMINOLOGY_NOT_FOUND`.
 * A terminology server that is down is not a client error: that failure propagates (502/504).
 */
@Injectable()
export class TerminologyValidatorService {
  private readonly logger = new Logger(TerminologyValidatorService.name);

  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  async assertIcd10Codes(codes: readonly string[]): Promise<void> {
    const distinct = [...new Set(codes)];
    const checks = await mapWithConcurrency(distinct, LOOKUP_CONCURRENCY, (code) =>
      this.validate({ system: ICD10_CODE_SYSTEM, code }, FHIR_BY.ICD10_VALUE_SET),
    );
    const unknown = distinct.filter((_code, index) => checks[index]?.isKnown !== true);
    if (unknown.length > 0) {
      throw new UnprocessableEntityException({
        errorCode: 'INVALID_ICD10_CODE',
        message: `INVALID_ICD10_CODE: not in ${FHIR_BY.ICD10_VALUE_SET}: ${unknown.join(', ')}`,
      });
    }
  }

  /** Every ref must be in the seeded ValueSet of its system; returns the displays HAPI resolved. */
  async assertCodesExist(refs: readonly TerminologyRef[]): Promise<TerminologyDisplays> {
    const distinct = uniqueRefs(refs);
    const outside = distinct.filter(isOutsideSeed);
    if (outside.length > 0) {
      throw this.notFound(outside);
    }
    const checks = await mapWithConcurrency(distinct, LOOKUP_CONCURRENCY, (ref) =>
      this.validate(ref, SEEDED_VALUE_SETS[ref.system] ?? ''),
    );
    const unknown = distinct.filter((_ref, index) => checks[index]?.isKnown !== true);
    if (unknown.length > 0) {
      throw this.notFound(unknown);
    }
    return collectDisplays(distinct, checks);
  }

  private async validate(ref: TerminologyRef, valueSetUrl: string): Promise<CodeCheck> {
    try {
      const params = { url: valueSetUrl, system: ref.system, code: ref.code };
      return parseValidateCode(await this.fhir.operation('ValueSet', '$validate-code', params));
    } catch (error) {
      const status = error instanceof FhirClientError ? error.upstreamStatus : undefined;
      if (status !== undefined && NOT_FOUND_STATUSES.has(status)) {
        // An unseeded ValueSet looks exactly like this; worth seeing in the log, not worth a 5xx.
        this.logger.warn({ valueSetUrl, code: ref.code, status }, 'terminology lookup answered as unknown code');
        return { isKnown: false };
      }
      throw error;
    }
  }

  private notFound(refs: readonly TerminologyRef[]): UnprocessableEntityException {
    const listed = refs.map((ref) => `${ref.system}#${ref.code}`).join(', ');
    return new UnprocessableEntityException({
      errorCode: 'TERMINOLOGY_NOT_FOUND',
      message: `TERMINOLOGY_NOT_FOUND: not in the terminology seed: ${listed}`,
    });
  }
}
