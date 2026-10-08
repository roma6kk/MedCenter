/**
 * ATC code guard. The frontend spec (frontend §5.3) and the plan both quote
 * `^[A-Z][0-9]{2}[A-Z]{2}([0-9]{2}[A-Z]{2})?$`, but that pattern can never
 * match a real level-5 code such as `J01FA10`, which the plan's own test
 * requires to be accepted. The intended grammar is:
 *
 *   level-4  L dd cc        -> 5 chars  (J01F)
 *   level-5  L dd cc dd     -> 7 chars  (J01FA10)
 *
 * i.e. `[A-Z]` + two digits (anatomical) + two letters (therapeutic) with an
 * optional trailing two-digit chemical subgroup.
 */
const ATC_PATTERN = /^[A-Z][0-9]{2}[A-Z]{2}([0-9]{2})?$/;

export function isValidAtcCode(code: string): boolean {
  return ATC_PATTERN.test(code);
}
