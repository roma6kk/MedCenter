import type { FhirResource, FhirSearchResult } from '@medcenter/fhir';

import { toConcepts, toValidation, toValueSetSummaries } from './value-set-parser';

function valueSet(fields: Record<string, unknown>): FhirResource {
  return { resourceType: 'ValueSet', ...fields };
}

describe('toValueSetSummaries', () => {
  it('should keep only fhir.by ValueSets and order them by canonical when HAPI holds foreign ones too', () => {
    const result: FhirSearchResult = {
      entry: [
        { resource: valueSet({ url: 'https://fhir.by/ValueSet/ucum-units', name: 'ucum', version: '1' }) },
        { resource: valueSet({ url: 'http://hl7.org/fhir/ValueSet/administrative-gender' }) },
        { resource: valueSet({ url: 'https://fhir.by/ValueSet/atc', title: 'АТХ', status: 'active' }) },
        { resource: valueSet({ name: 'no-canonical' }) },
      ],
    };

    expect(toValueSetSummaries(result)).toEqual([
      { url: 'https://fhir.by/ValueSet/atc', title: 'АТХ', status: 'active' },
      { url: 'https://fhir.by/ValueSet/ucum-units', name: 'ucum', version: '1' },
    ]);
  });

  it('should return an empty list when the search Bundle has no entries', () => {
    expect(toValueSetSummaries({ total: 0 })).toEqual([]);
  });
});

describe('toConcepts', () => {
  it('should flatten nested contains and skip grouping nodes that carry no code', () => {
    const expanded = valueSet({
      expansion: {
        total: 7,
        contains: [
          {
            system: 'https://fhir.by/CodeSystem/InternClassificDiseases10',
            code: 'J06',
            display: 'ОРВИ',
            contains: [{ system: 'https://fhir.by/CodeSystem/InternClassificDiseases10', code: 'J06.9' }],
          },
          { display: 'abstract group', contains: [{ system: 'http://unitsofmeasure.org', code: 'mg', display: 'mg' }] },
        ],
      },
    });

    expect(toConcepts(expanded)).toEqual({
      total: 7,
      items: [
        { system: 'https://fhir.by/CodeSystem/InternClassificDiseases10', code: 'J06', display: 'ОРВИ' },
        { system: 'https://fhir.by/CodeSystem/InternClassificDiseases10', code: 'J06.9' },
        { system: 'http://unitsofmeasure.org', code: 'mg', display: 'mg' },
      ],
    });
  });

  it('should fall back to the number of concepts when the server reports no usable total', () => {
    const expanded = valueSet({ expansion: { total: 'many', contains: [{ system: 's', code: 'a' }] } });

    expect(toConcepts(expanded).total).toBe(1);
  });

  it('should return nothing when the ValueSet has no expansion', () => {
    expect(toConcepts(valueSet({}))).toEqual({ total: 0, items: [] });
  });
});

describe('toValidation', () => {
  it('should report the display HAPI resolved when the code is in the ValueSet', () => {
    const parameters: FhirResource = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'result', valueBoolean: true },
        { name: 'display', valueString: 'ОРВИ' },
      ],
    };

    expect(toValidation(parameters)).toEqual({ valid: true, display: 'ОРВИ' });
  });

  it('should treat a missing or false result as invalid', () => {
    expect(toValidation({ resourceType: 'Parameters', parameter: [{ name: 'result', valueBoolean: false }] })).toEqual({ valid: false });
    expect(toValidation({ resourceType: 'Parameters' })).toEqual({ valid: false });
  });
});
