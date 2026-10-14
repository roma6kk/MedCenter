import { FhirHttp } from '../shared/fhir-http';
import { InMemoryFhirServer } from '../shared/in-memory-fhir';
import { seedTerminology, type VerifyOptions } from './seed-terminology';
import {
  describeProof,
  findRejectedCodes,
  isCodeValid,
  KEY_CODES,
  proveKeyCode,
  proveKeyCodes,
} from './terminology-proof';
import { buildExpansionChecks, TERMINOLOGY_URLS } from './terminology-resources';

const NO_WAIT: VerifyOptions = { attempts: 2, delayMs: 0, sleep: () => Promise.resolve() };

async function seededHttp(): Promise<FhirHttp> {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const http = new FhirHttp('http://fhir.test/fhir', new InMemoryFhirServer().fetch);
  await seedTerminology(http, NO_WAIT);
  return http;
}

describe('isCodeValid', () => {
  afterEach(() => jest.restoreAllMocks());

  it('should accept a snapshot code of the ValueSet', async () => {
    const http = await seededHttp();

    const isValid = await isCodeValid(http, TERMINOLOGY_URLS.ICD10_VALUE_SET, TERMINOLOGY_URLS.ICD10_CODE_SYSTEM, 'J06.9');

    expect(isValid).toBe(true);
  });

  it('should refuse a code that is not in the snapshot', async () => {
    const http = await seededHttp();

    const isValid = await isCodeValid(http, TERMINOLOGY_URLS.UCUM_VALUE_SET, TERMINOLOGY_URLS.UCUM_SYSTEM, 'bushel');

    expect(isValid).toBe(false);
  });

  it('should refuse a known code when it is asked under another system', async () => {
    const http = await seededHttp();

    const isValid = await isCodeValid(http, TERMINOLOGY_URLS.ATC_VALUE_SET, TERMINOLOGY_URLS.UCUM_SYSTEM, 'J01FA10');

    expect(isValid).toBe(false);
  });
});

describe('findRejectedCodes', () => {
  afterEach(() => jest.restoreAllMocks());

  it('should return no codes when every snapshot code is a member of the seeded ValueSet', async () => {
    const http = await seededHttp();

    for (const check of buildExpansionChecks()) {
      expect(await findRejectedCodes(http, check)).toEqual([]);
    }
  });

  it('should name the snapshot codes the server refuses when the ValueSet is not seeded', async () => {
    const http = new FhirHttp('http://fhir.test/fhir', async () => {
      const body = { resourceType: 'Parameters', parameter: [{ name: 'result', valueBoolean: false }] };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const [check] = buildExpansionChecks();

    const rejected = await findRejectedCodes(http, check ?? fail('no expansion checks'));

    expect(rejected).toEqual(check?.expectedCodes);
  });
});

describe('proveKeyCodes', () => {
  afterEach(() => jest.restoreAllMocks());

  it('should prove J06.9, J01FA10 and Cel through $validate-code and $expand filter', async () => {
    const http = await seededHttp();

    const proofs = await proveKeyCodes(http);

    expect(proofs.map((proof) => [proof.code, proof.isValid, proof.isFoundByFilter])).toEqual([
      ['J06.9', true, true],
      ['J01FA10', true, true],
      ['Cel', true, true],
    ]);
  });

  it('should filter by the concept display because the server does not match codes', async () => {
    const http = await seededHttp();

    const proof = await proveKeyCode(http, KEY_CODES[0] ?? fail('no key codes'));

    expect(proof.display).toBe('Острая инфекция верхних дыхательных путей неуточнённая');
    expect(proof.filterMatches).toBe(1);
  });

  it('should report a key code as not found when the ValueSet is empty of it', async () => {
    const http = await seededHttp();
    const proof = await proveKeyCode(http, { label: 'ICD-10', valueSetUrl: TERMINOLOGY_URLS.ICD10_VALUE_SET, code: 'J06.9' });
    await http.put({ resourceType: 'ValueSet', id: 'vs-icd10', url: TERMINOLOGY_URLS.ICD10_VALUE_SET, compose: { include: [] } });

    const afterWipe = await proveKeyCode(http, { label: 'ICD-10', valueSetUrl: TERMINOLOGY_URLS.ICD10_VALUE_SET, code: 'J06.9' });

    expect(proof.isFoundByFilter).toBe(true);
    expect([afterWipe.isValid, afterWipe.isFoundByFilter]).toEqual([false, false]);
  });

  it('should reject a key code that is not part of the snapshot', async () => {
    const http = await seededHttp();

    await expect(
      proveKeyCode(http, { label: 'ICD-10', valueSetUrl: TERMINOLOGY_URLS.ICD10_VALUE_SET, code: 'ZZZ99' }),
    ).rejects.toThrow(/not in the snapshot/);
  });
});

describe('describeProof', () => {
  it('should flag a proof whose code is not found as FAILED', () => {
    const line = describeProof({
      label: 'UCUM',
      valueSetUrl: TERMINOLOGY_URLS.UCUM_VALUE_SET,
      code: 'Cel',
      display: 'градус Цельсия',
      isValid: true,
      isFoundByFilter: false,
      filterMatches: 0,
    });

    expect(line).toMatch(/^FAILED UCUM Cel/);
  });
});
