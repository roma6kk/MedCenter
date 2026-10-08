/**
 * UCUM unit closed-set lookup (BR-009 forbids free-text units).
 *
 * The known-set below is a curated subset of the UCUM catalogue commonly
 * used in clinical documentation. `expanded` is an optional set of units
 * resolved from a ValueSet `$expand`; when it is present the lookup consults
 * it first, then falls back to the hard closed set. Free-text or unknown
 * units always resolve to `false`.
 */
const KNOWN_UCUM_UNITS = new Set<string>([
  'm', 'kg', 's', 'A', 'K', 'mol', 'cd',
  'g', 'mg', 'mcg', 'kg/m3', 'mol/m3', 'U', 'UI',
  'mmol', 'mmol/L', 'mmol/s', 'mmol/min', 'mmol/h',
  'mm/Hg', 'mmHg', 'bpm', 'min', 'h', 'min/h',
  'J', 'W', 'W/h', 'Pa', 'kPa', 'hPa',
  'L', 'mL', 'dL', 'L/min', 'L/kg', 'L/h',
  'pmol/L', 'nmol/L', 'ng/mL', 'ug/L', 'U/g',
  'counts', 'cps', 'dpn', 'coth', 'C',
]);

export function isKnownUcumUnit(unit: string, expanded: ReadonlySet<string> = new Set()): boolean {
  if (!unit) {
    return false;
  }
  if (expanded instanceof Set && expanded.size > 0) {
    return expanded.has(unit);
  }
  return KNOWN_UCUM_UNITS.has(unit);
}
