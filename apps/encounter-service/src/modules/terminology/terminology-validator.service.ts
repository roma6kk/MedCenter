import { Inject, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type { FieldErrorDetail } from '@medcenter/contracts';
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

/** Where a code sits in the request: its path is what a 422 reports in `details[].field`. */
export interface CodeLocation {
  /** Request path of the code, e.g. `diagnoses.0.code` (same syntax as the `details[].field` of a 400). */
  readonly field?: string;
}

export interface TerminologyRef extends CodeLocation {
  readonly system: string;
  readonly code: string;
}

/** An ICD-10 code of the request (the system is always {@link ICD10_CODE_SYSTEM}). */
export interface Icd10Ref extends CodeLocation {
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

/** One `details[]` entry per request field that carries an offending code, in request order; refs without a path are skipped. */
function fieldDetails<TRef extends CodeLocation>(refs: readonly TRef[], describe: (ref: TRef) => string): FieldErrorDetail[] {
  return refs.flatMap((ref) => (ref.field === undefined ? [] : [{ field: ref.field, message: describe(ref) }]));
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

  async assertIcd10Codes(refs: readonly Icd10Ref[]): Promise<void> {
    const distinct = [...new Set(refs.map((ref) => ref.code))];
    const checks = await mapWithConcurrency(distinct, LOOKUP_CONCURRENCY, (code) =>
      this.validate({ system: ICD10_CODE_SYSTEM, code }, FHIR_BY.ICD10_VALUE_SET),
    );
    const unknown = distinct.filter((_code, index) => checks[index]?.isKnown !== true);
    if (unknown.length > 0) {
      const details = fieldDetails(
        refs.filter((ref) => unknown.includes(ref.code)),
        (ref) => `${ref.code} is not in ValueSet ${FHIR_BY.ICD10_VALUE_SET}`,
      );
      throw new UnprocessableEntityException({
        errorCode: 'INVALID_ICD10_CODE',
        message: `INVALID_ICD10_CODE: not in ${FHIR_BY.ICD10_VALUE_SET}: ${unknown.join(', ')}`,
        ...(details.length > 0 ? { details } : {}),
      });
    }
  }

  /**
   * Every ref must be in the seeded ValueSet of its system; returns the displays
   * HAPI resolved. Codes of systems outside the seed are refused without a
   * lookup, the rest is looked up, and the refusal names all of them at once.
   */
  async assertCodesExist(refs: readonly TerminologyRef[]): Promise<TerminologyDisplays> {
    const distinct = uniqueRefs(refs);
    const outside = distinct.filter(isOutsideSeed);
    const lookedUp = distinct.filter((ref) => !isOutsideSeed(ref));
    const checks = await mapWithConcurrency(lookedUp, LOOKUP_CONCURRENCY, (ref) =>
      this.validate(ref, SEEDED_VALUE_SETS[ref.system] ?? ''),
    );
    const unknown = lookedUp.filter((_ref, index) => checks[index]?.isKnown !== true);
    if (outside.length + unknown.length > 0) {
      throw this.notFound([...outside, ...unknown], refs);
    }
    return collectDisplays(lookedUp, checks);
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

  /** `missing` are the distinct refs to name in the message; `requested` are all refs, so every field that carries one is reported. */
  private notFound(missing: readonly TerminologyRef[], requested: readonly TerminologyRef[]): UnprocessableEntityException {
    const listed = missing.map((ref) => `${ref.system}#${ref.code}`).join(', ');
    const missingKeys = new Set(missing.map((ref) => displayKey(ref.system, ref.code)));
    const details = fieldDetails(
      requested.filter((ref) => missingKeys.has(displayKey(ref.system, ref.code))),
      (ref) => `${ref.code} is not in the terminology seed (${ref.system})`,
    );
    return new UnprocessableEntityException({
      errorCode: 'TERMINOLOGY_NOT_FOUND',
      message: `TERMINOLOGY_NOT_FOUND: not in the terminology seed: ${listed}`,
      ...(details.length > 0 ? { details } : {}),
    });
  }
}
