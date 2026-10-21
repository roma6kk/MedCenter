import { FhirClientError, type FhirClient } from '@medcenter/fhir';
import { FHIR_BY } from '@medcenter/terminology';

import { createFhirMock, errorPayloadOf, validateCodeAnswer } from '../encounters/__tests__/encounter.fixtures';
import { displayKey, ICD10_CODE_SYSTEM, SEEDED_VALUE_SETS, TerminologyValidatorService } from './terminology-validator.service';

describe('TerminologyValidatorService', () => {
  let fhir: jest.Mocked<FhirClient>;
  let service: TerminologyValidatorService;

  beforeEach(() => {
    fhir = createFhirMock();
    service = new TerminologyValidatorService(fhir);
  });

  it('should accept an ICD-10 code when the seeded ValueSet contains it', async () => {
    fhir.operation.mockResolvedValue(validateCodeAnswer(true));

    await expect(service.assertIcd10Codes([{ code: 'J06.9', field: 'diagnoses.0.code' }])).resolves.toBeUndefined();
    expect(fhir.operation).toHaveBeenCalledWith('ValueSet', '$validate-code', {
      url: 'https://fhir.by/ValueSet/InternClassificDiseases10',
      system: ICD10_CODE_SYSTEM,
      code: 'J06.9',
    });
  });

  it('should reject with INVALID_ICD10_CODE when only the three-character category is seeded', async () => {
    fhir.operation.mockImplementation(async (_type, _operation, params) => validateCodeAnswer(params?.['code'] === 'J06'));

    expect(await errorPayloadOf(service.assertIcd10Codes([{ code: 'J06.8', field: 'diagnoses.0.code' }]))).toMatchObject({ errorCode: 'INVALID_ICD10_CODE' });
  });

  it('should reject an ATC code absent from the seeded ValueSet with TERMINOLOGY_NOT_FOUND', async () => {
    fhir.operation.mockResolvedValue(validateCodeAnswer(false));

    const lookup = service.assertCodesExist([{ system: FHIR_BY.ATC_CODE_SYSTEM, code: 'J01FA10' }]);

    expect(await errorPayloadOf(lookup)).toMatchObject({ errorCode: 'TERMINOLOGY_NOT_FOUND' });
    expect(fhir.operation).toHaveBeenCalledWith('ValueSet', '$validate-code', {
      url: 'https://fhir.by/ValueSet/atc',
      system: FHIR_BY.ATC_CODE_SYSTEM,
      code: 'J01FA10',
    });
  });

  it('should check a UCUM unit against the closed fhir.by unit ValueSet when the grammar is valid', async () => {
    fhir.operation.mockResolvedValue(validateCodeAnswer(true));

    await service.assertCodesExist([{ system: FHIR_BY.UCUM_SYSTEM, code: 'Cel' }]);

    expect(fhir.operation).toHaveBeenCalledWith('ValueSet', '$validate-code', {
      url: SEEDED_VALUE_SETS[FHIR_BY.UCUM_SYSTEM],
      system: FHIR_BY.UCUM_SYSTEM,
      code: 'Cel',
    });
  });

  it('should reject a free-text unit with TERMINOLOGY_NOT_FOUND without asking the terminology server', async () => {
    const lookup = service.assertCodesExist([{ system: FHIR_BY.UCUM_SYSTEM, code: 'горсть' }]);

    expect(await errorPayloadOf(lookup)).toMatchObject({ errorCode: 'TERMINOLOGY_NOT_FOUND' });
    expect(fhir.operation).not.toHaveBeenCalled();
  });

  it('should reject a code system outside the terminology seed without asking the terminology server', async () => {
    const lookup = service.assertCodesExist([{ system: 'http://loinc.org', code: '8310-5' }]);

    expect(await errorPayloadOf(lookup)).toMatchObject({ errorCode: 'TERMINOLOGY_NOT_FOUND' });
    expect(fhir.operation).not.toHaveBeenCalled();
  });

  it('should treat a 404 from the terminology server as an unknown code', async () => {
    fhir.operation.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/ValueSet/$validate-code', 404, '{}'));

    const lookup = service.assertCodesExist([{ system: FHIR_BY.UCUM_SYSTEM, code: 'Cel' }]);

    expect(await errorPayloadOf(lookup)).toMatchObject({ errorCode: 'TERMINOLOGY_NOT_FOUND' });
  });

  it('should propagate an unavailable terminology server instead of rejecting the codes', async () => {
    fhir.operation.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/ValueSet/$validate-code', 503, ''));

    await expect(service.assertCodesExist([{ system: FHIR_BY.UCUM_SYSTEM, code: 'Cel' }])).rejects.toBeInstanceOf(FhirClientError);
  });

  it('should look up each distinct code once when the request repeats it', async () => {
    fhir.operation.mockResolvedValue(validateCodeAnswer(true));

    await service.assertCodesExist([
      { system: FHIR_BY.UCUM_SYSTEM, code: 'Cel' },
      { system: FHIR_BY.UCUM_SYSTEM, code: 'Cel' },
    ]);

    expect(fhir.operation).toHaveBeenCalledTimes(1);
  });

  it('should return the display the terminology server resolved when the code is known', async () => {
    fhir.operation.mockResolvedValue(validateCodeAnswer(true, 'Азитромицин'));

    const displays = await service.assertCodesExist([{ system: FHIR_BY.ATC_CODE_SYSTEM, code: 'J01FA10' }]);

    expect(displays.get(displayKey(FHIR_BY.ATC_CODE_SYSTEM, 'J01FA10'))).toBe('Азитромицин');
  });

  describe('details[] of the 422 problem', () => {
    const ICD10_VALUE_SET = 'https://fhir.by/ValueSet/InternClassificDiseases10';

    it('should name every diagnosis row that carries an unknown ICD-10 code, keeping the code list in the message', async () => {
      fhir.operation.mockImplementation(async (_type, _operation, params) => validateCodeAnswer(params?.['code'] === 'J06.9'));

      const payload = await errorPayloadOf(
        service.assertIcd10Codes([
          { code: 'Z99', field: 'diagnoses.0.code' },
          { code: 'J06.9', field: 'diagnoses.1.code' },
          { code: 'Z99', field: 'diagnoses.2.code' },
        ]),
      );

      expect(payload).toEqual({
        errorCode: 'INVALID_ICD10_CODE',
        message: `INVALID_ICD10_CODE: not in ${ICD10_VALUE_SET}: Z99`,
        details: [
          { field: 'diagnoses.0.code', message: `Z99 is not in ValueSet ${ICD10_VALUE_SET}` },
          { field: 'diagnoses.2.code', message: `Z99 is not in ValueSet ${ICD10_VALUE_SET}` },
        ],
      });
    });

    it('should name the medication, observation and unit fields of every unknown terminology code', async () => {
      fhir.operation.mockImplementation(async (_type, _operation, params) => validateCodeAnswer(params?.['code'] === '20006'));

      const payload = await errorPayloadOf(
        service.assertCodesExist([
          { system: FHIR_BY.ATC_CODE_SYSTEM, code: 'J01FA10', field: 'medicationRequests.1.atcCode' },
          { system: 'https://fhir.by/CodeSystem/nsi-observations', code: '20006', field: 'observations.0.code' },
          { system: FHIR_BY.UCUM_SYSTEM, code: 'горсть', field: 'observations.0.unit' },
        ]),
      );

      expect(payload).toMatchObject({
        errorCode: 'TERMINOLOGY_NOT_FOUND',
        message: `TERMINOLOGY_NOT_FOUND: not in the terminology seed: ${FHIR_BY.UCUM_SYSTEM}#горсть, ${FHIR_BY.ATC_CODE_SYSTEM}#J01FA10`,
        details: [
          { field: 'medicationRequests.1.atcCode', message: `J01FA10 is not in the terminology seed (${FHIR_BY.ATC_CODE_SYSTEM})` },
          { field: 'observations.0.unit', message: `горсть is not in the terminology seed (${FHIR_BY.UCUM_SYSTEM})` },
        ],
      });
    });

    it('should report a code system outside the seed together with an unknown seeded code when both occur', async () => {
      fhir.operation.mockResolvedValue(validateCodeAnswer(false));

      const payload = await errorPayloadOf(
        service.assertCodesExist([
          { system: 'http://loinc.org', code: '8310-5', field: 'observations.0.code' },
          { system: FHIR_BY.ATC_CODE_SYSTEM, code: 'J01FA10', field: 'medicationRequests.0.atcCode' },
        ]),
      );

      expect(payload).toMatchObject({
        details: [
          { field: 'observations.0.code', message: expect.stringContaining('8310-5') },
          { field: 'medicationRequests.0.atcCode', message: expect.stringContaining('J01FA10') },
        ],
      });
    });

    it('should leave details out when the refs carry no field', async () => {
      fhir.operation.mockResolvedValue(validateCodeAnswer(false));

      const payload = await errorPayloadOf(service.assertCodesExist([{ system: FHIR_BY.ATC_CODE_SYSTEM, code: 'J01FA10' }]));

      expect(payload).not.toHaveProperty('details');
    });
  });
});
