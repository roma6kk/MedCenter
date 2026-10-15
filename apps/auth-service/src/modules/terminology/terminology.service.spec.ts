import { Logger, NotFoundException } from '@nestjs/common';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { ICD10_SYSTEM, ICD10_VALUE_SET, createFhir, upstream } from './__tests__/terminology-fixtures';
import { InMemoryTerminologyCache } from './terminology-cache';
import { TerminologyService } from './terminology.service';

describe('TerminologyService', () => {
  describe('expand', () => {
    it('should page the expansion through HAPI with the default page when no filter is given', async () => {
      const fhir = createFhir();
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      const result = await service.expand(ICD10_VALUE_SET, {});

      expect(fhir.operation).toHaveBeenCalledWith('ValueSet', '$expand', { url: ICD10_VALUE_SET, count: 20, offset: 0 });
      expect(result).toEqual({
        valueSet: ICD10_VALUE_SET,
        total: 1,
        items: [{ system: ICD10_SYSTEM, code: 'J06.9', display: 'ОРВИ' }],
      });
    });

    it('should serve the second identical page from the cache when HAPI already answered', async () => {
      const fhir = createFhir();
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());
      await service.expand(ICD10_VALUE_SET, { count: 5, offset: 5 });

      await service.expand(ICD10_VALUE_SET, { count: 5, offset: 5 });

      expect(fhir.operation).toHaveBeenCalledTimes(1);
    });

    it('should not share a cache entry between different pages', async () => {
      const fhir = createFhir();
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      await service.expand(ICD10_VALUE_SET, {});
      await service.expand(ICD10_VALUE_SET, { offset: 20 });

      expect(fhir.operation).toHaveBeenCalledTimes(2);
    });

    it('should ignore a cache entry it cannot read and ask HAPI again', async () => {
      const fhir = createFhir();
      const cache = new InMemoryTerminologyCache();
      jest.spyOn(cache, 'get').mockResolvedValue('{not json');
      const service = new TerminologyService(fhir, cache);

      await service.expand(ICD10_VALUE_SET, {});

      expect(fhir.operation).toHaveBeenCalledTimes(1);
    });

    it.each([404, 422])('should answer 404 NOT_FOUND when HAPI answers %i for an unknown ValueSet', async (status) => {
      const fhir = createFhir();
      fhir.operation.mockRejectedValue(upstream(status));
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      const attempt = service.expand('https://fhir.by/ValueSet/missing', {});

      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should let a HAPI 400 propagate as a defect instead of reporting an unknown ValueSet', async () => {
      const fhir = createFhir();
      fhir.operation.mockRejectedValue(upstream(400));
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      await expect(service.expand(ICD10_VALUE_SET, {})).rejects.toMatchObject({ status: 500 });
    });

    it('should let an unavailable HAPI propagate instead of reporting an unknown ValueSet', async () => {
      const fhir = createFhir();
      fhir.operation.mockRejectedValue(upstream(503));
      const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

      await expect(service.expand(ICD10_VALUE_SET, {})).rejects.toBeInstanceOf(FhirClientError);
    });

    describe('with a text filter', () => {
      const CONCEPTS = [
        { system: ICD10_SYSTEM, code: 'J06', display: 'Острые инфекции верхних дыхательных путей' },
        { system: ICD10_SYSTEM, code: 'J06.9', display: 'Острая инфекция верхних дыхательных путей неуточнённая' },
        { system: ICD10_SYSTEM, code: 'M54.5', display: 'Боль внизу спины' },
      ];

      function serviceOver(concepts: ReadonlyArray<Record<string, string>>): {
        readonly fhir: jest.Mocked<FhirClient>;
        readonly service: TerminologyService;
      } {
        const fhir = createFhir();
        fhir.operation.mockResolvedValue({
          resourceType: 'ValueSet',
          expansion: { total: concepts.length, contains: concepts },
        });
        return { fhir, service: new TerminologyService(fhir, new InMemoryTerminologyCache()) };
      }

      it('should match by code prefix because HAPI filters on the display text only', async () => {
        const { service } = serviceOver(CONCEPTS);

        const result = await service.expand(ICD10_VALUE_SET, { filter: 'j06' });

        expect(result.items.map((item) => item.code)).toEqual(['J06', 'J06.9']);
        expect(result.total).toBe(2);
      });

      it('should match by display text regardless of letter case', async () => {
        const { service } = serviceOver(CONCEPTS);

        const result = await service.expand(ICD10_VALUE_SET, { filter: 'ИНФЕКЦИЯ' });

        expect(result.items.map((item) => item.code)).toEqual(['J06.9']);
      });

      it('should page the matches and report the number of all matches as total', async () => {
        const { service } = serviceOver(CONCEPTS);

        const result = await service.expand(ICD10_VALUE_SET, { filter: 'J', count: 1, offset: 1 });

        expect(result).toMatchObject({ total: 2, items: [{ code: 'J06.9' }] });
      });

      it('should read the whole ValueSet from HAPI once for every later filter', async () => {
        const { fhir, service } = serviceOver(CONCEPTS);

        await service.expand(ICD10_VALUE_SET, { filter: 'J0' });
        await service.expand(ICD10_VALUE_SET, { filter: 'J06' });
        await service.expand(ICD10_VALUE_SET, { filter: 'M54' });

        expect(fhir.operation).toHaveBeenCalledTimes(1);
        expect(fhir.operation).toHaveBeenCalledWith('ValueSet', '$expand', { url: ICD10_VALUE_SET, count: 500, offset: 0 });
      });

      it('should keep reading HAPI pages until the reported total is reached', async () => {
        const fhir = createFhir();
        const page = (codes: string[], total: number): FhirResource => ({
          resourceType: 'ValueSet',
          expansion: { total, contains: codes.map((code) => ({ system: ICD10_SYSTEM, code })) },
        });
        fhir.operation.mockResolvedValueOnce(page(['A01', 'A02'], 3)).mockResolvedValueOnce(page(['A03'], 3));
        const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

        const result = await service.expand(ICD10_VALUE_SET, { filter: 'A0' });

        expect(result.total).toBe(3);
        expect(fhir.operation).toHaveBeenLastCalledWith('ValueSet', '$expand', { url: ICD10_VALUE_SET, count: 500, offset: 500 });
      });

      it('should warn and search only the scanned concepts when the ValueSet exceeds the scan cap', async () => {
        const fhir = createFhir();
        const contains = Array.from({ length: 500 }, (_, index) => ({ system: ICD10_SYSTEM, code: `A${index}` }));
        fhir.operation.mockResolvedValue({ resourceType: 'ValueSet', expansion: { total: 25_000, contains } });
        const service = new TerminologyService(fhir, new InMemoryTerminologyCache());
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

        const result = await service.expand(ICD10_VALUE_SET, { filter: 'A1', count: 1 });

        expect(fhir.operation).toHaveBeenCalledTimes(20);
        expect(result.total).toBeGreaterThan(0);
        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({ scanned: 10_000, total: 25_000 }),
          expect.stringContaining('scan cap'),
        );
        warn.mockRestore();
      });

      it('should not warn when the whole ValueSet fits the scan cap', async () => {
        const { service } = serviceOver(CONCEPTS);
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

        await service.expand(ICD10_VALUE_SET, { filter: 'J' });

        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
      });

      it('should answer an empty page when nothing matches', async () => {
        const { service } = serviceOver(CONCEPTS);

        const result = await service.expand(ICD10_VALUE_SET, { filter: 'zzz' });

        expect(result).toEqual({ valueSet: ICD10_VALUE_SET, total: 0, items: [] });
      });

      it('should answer 404 NOT_FOUND when the ValueSet is unknown to HAPI', async () => {
        const fhir = createFhir();
        fhir.operation.mockRejectedValue(upstream(404));
        const service = new TerminologyService(fhir, new InMemoryTerminologyCache());

        await expect(service.expand('https://fhir.by/ValueSet/missing', { filter: 'J' })).rejects.toBeInstanceOf(NotFoundException);
      });
    });
  });
});
