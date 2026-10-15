import { FhirClientError } from '@medcenter/fhir';

import { ATC_SYSTEM, ICD10_SYSTEM, ICD10_VALUE_SET, createFhir, upstream } from './__tests__/terminology-fixtures';
import { InMemoryTerminologyCache } from './terminology-cache';
import { TerminologyService } from './terminology.service';

describe('TerminologyService', () => {
  describe('validate', () => {
    it('should validate against the seeded ValueSet of the system and return the display', async () => {
      const fhir = createFhir();
      fhir.operation.mockResolvedValue({
        resourceType: 'Parameters',
        parameter: [{ name: 'result', valueBoolean: true }, { name: 'display', valueString: 'ОРВИ' }],
      });
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      const result = await service.validate(ICD10_SYSTEM, 'J06.9');

      expect(fhir.operation).toHaveBeenCalledWith('ValueSet', '$validate-code', { url: ICD10_VALUE_SET, system: ICD10_SYSTEM, code: 'J06.9' });
      expect(result).toEqual({ system: ICD10_SYSTEM, code: 'J06.9', valid: true, display: 'ОРВИ' });
    });

    it.each([['j06.9'], ['J0'], ['J06.999'], ['ОРВИ']])(
      'should answer valid=false without calling HAPI when the ICD-10 code %s has not the ICD-10 shape',
      async (code) => {
        const fhir = createFhir();
        const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

        const result = await service.validate(ICD10_SYSTEM, code);

        expect(result).toEqual({ system: ICD10_SYSTEM, code, valid: false });
        expect(fhir.operation).not.toHaveBeenCalled();
      },
    );

    it('should answer valid=false without calling HAPI when an ATC code has not the ATC shape', async () => {
      const fhir = createFhir();
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      const result = await service.validate(ATC_SYSTEM, 'j01fa10');

      expect(result).toEqual({ system: ATC_SYSTEM, code: 'j01fa10', valid: false });
      expect(fhir.operation).not.toHaveBeenCalled();
    });

    it('should leave a UCUM unit to HAPI because it has no fixed shape', async () => {
      const fhir = createFhir();
      fhir.operation.mockResolvedValue({ resourceType: 'Parameters', parameter: [{ name: 'result', valueBoolean: true }] });
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      const result = await service.validate('http://unitsofmeasure.org', 'mm[Hg]');

      expect(result.valid).toBe(true);
      expect(fhir.operation).toHaveBeenCalledTimes(1);
    });

    it('should answer valid=false without calling HAPI when the system is outside the seed', async () => {
      const fhir = createFhir();
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      const result = await service.validate('http://snomed.info/sct', '123');

      expect(result).toEqual({ system: 'http://snomed.info/sct', code: '123', valid: false });
      expect(fhir.operation).not.toHaveBeenCalled();
    });

    it('should answer valid=false when HAPI does not know the code', async () => {
      const fhir = createFhir();
      fhir.operation.mockRejectedValue(upstream(422));
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      const result = await service.validate(ICD10_SYSTEM, 'Z99.9');

      expect(result.valid).toBe(false);
    });

    it('should let a HAPI 400 propagate instead of answering valid=false for a request this service built wrongly', async () => {
      const fhir = createFhir();
      fhir.operation.mockRejectedValue(upstream(400));
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      await expect(service.validate(ICD10_SYSTEM, 'J06.9')).rejects.toMatchObject({ status: 500 });
    });

    it('should let an unavailable HAPI propagate', async () => {
      const fhir = createFhir();
      fhir.operation.mockRejectedValue(upstream(503));
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      await expect(service.validate(ICD10_SYSTEM, 'J06.9')).rejects.toBeInstanceOf(FhirClientError);
    });
  });

  describe('listValueSets', () => {
    it('should search the fhir.by prefix and answer in the paginated envelope', async () => {
      const fhir = createFhir();
      fhir.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'ValueSet', url: 'https://fhir.by/ValueSet/atc' } }] });
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      const result = await service.listValueSets();

      expect(fhir.search).toHaveBeenCalledWith('ValueSet', expect.objectContaining({ 'url:below': 'https://fhir.by/ValueSet/' }));
      expect(result).toEqual({
        items: [{ url: 'https://fhir.by/ValueSet/atc' }],
        meta: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      });
    });
  });
});
