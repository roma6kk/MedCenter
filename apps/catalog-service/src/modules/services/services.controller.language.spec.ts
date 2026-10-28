import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { FhirClient } from '@medcenter/fhir';

import { RedisCacheService } from '../cache/redis-cache.service';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

describe('ServicesController Accept-Language', () => {
  it('should hand the language of the header to the catalog', async () => {
    const stored = { resourceType: 'HealthcareService', id: '1', name: 'ЭКГ', _name: { extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/translation', extension: [{ url: 'lang', valueCode: 'en' }, { url: 'content', valueString: 'ECG' }] }] } };
    const fhir = { read: jest.fn().mockResolvedValue(stored) } as unknown as FhirClient;
    const controller = new ServicesController(new ServicesService(fhir, new RedisCacheService()));

    expect((await controller.findById({ id: '1' }, 'en-US,en;q=0.9')).name).toBe('ECG');
    expect((await controller.findById({ id: '1' }, 'de')).name).toBe('ЭКГ');
    expect((await controller.findById({ id: '1' })).name).toBe('ЭКГ');
  });
});

describe('English fields of the service DTOs', () => {
  const base = { name: 'ЭКГ', typeSystem: 's', typeCode: 'c', defaultDurationMin: 20 };

  it('should accept the optional English name and description', async () => {
    const dto = plainToInstance(CreateServiceDto, { ...base, nameEn: 'ECG', descriptionEn: 'Resting ECG' });
    expect(await validate(dto)).toHaveLength(0);
    expect(await validate(plainToInstance(UpdateServiceDto, { nameEn: '' }))).toHaveLength(0);
  });

  it('should reject a non-string or too long English text', async () => {
    const tooLong = plainToInstance(CreateServiceDto, { ...base, nameEn: 'x'.repeat(201) });
    const wrongType = plainToInstance(UpdateServiceDto, { descriptionEn: 5 });
    expect((await validate(tooLong)).map((error) => error.property)).toEqual(['nameEn']);
    expect((await validate(wrongType)).map((error) => error.property)).toEqual(['descriptionEn']);
  });
});
