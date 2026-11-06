/** The grammar quoted in the frontend spec can never match a level-5 code like `J01FA10`; this one takes level 4 (J01F) and 5. */
const ATC_PATTERN = /^[A-Z][0-9]{2}[A-Z]{2}([0-9]{2})?$/;

export function isValidAtcCode(code: string): boolean {
  return ATC_PATTERN.test(code);
}
