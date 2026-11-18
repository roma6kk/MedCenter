import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FHIR_BY } from '@medcenter/terminology';

import { CompleteEncounterDto } from './complete-encounter.dto';

function body(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary: 'Жалобы на кашель',
    diagnoses: [{ code: 'J06.9', display: 'ОРВИ' }],
    recommendations: 'Тёплое питьё',
    ...patch,
  };
}

async function failedPaths(plain: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CompleteEncounterDto, plain));
  const walk = (list: typeof errors, prefix: string): string[] =>
    list.flatMap((error) => {
      const path = prefix === '' ? error.property : `${prefix}.${error.property}`;
      return [...(error.constraints ? [path] : []), ...walk(error.children ?? [], path)];
    });
  return walk(errors, '');
}

describe('CompleteEncounterDto', () => {
  it('should accept a complete body', async () => {
    expect(await failedPaths(body())).toEqual([]);
  });

  it('should refuse the texts that are only spaces', async () => {
    const paths = await failedPaths(
      body({
        summary: '     ',
        recommendations: '     ',
        diagnoses: [{ code: 'J06.9', display: '   ' }],
        medicationRequests: [{ atcCode: 'J01FA10', dosageText: '     ' }],
      }),
    );

    expect(paths).toEqual(
      expect.arrayContaining(['summary', 'recommendations', 'diagnoses.0.display', 'medicationRequests.0.dosageText']),
    );
  });

  it('should refuse a service request coded outside the НСИ services and an observation outside the НСИ observations', async () => {
    const paths = await failedPaths(
      body({
        serviceRequests: [{ codeSystem: FHIR_BY.ATC_CODE_SYSTEM, code: 'J06.9' }],
        observations: [{ codeSystem: FHIR_BY.SERVICE_CODE_SYSTEM, code: '10001', value: 1, unit: 'Cel' }],
      }),
    );

    expect(paths).toEqual(expect.arrayContaining(['serviceRequests.0.codeSystem', 'observations.0.codeSystem']));
  });

  it('should refuse a diagnosis or an ATC code that is sent twice', async () => {
    const paths = await failedPaths(
      body({
        diagnoses: [{ code: 'J06.9', display: 'ОРВИ' }, { code: 'j06.9', display: 'ОРВИ' }],
        medicationRequests: [
          { atcCode: 'J01FA10', dosageText: '1 таб' },
          { atcCode: 'J01FA10', dosageText: '2 таб' },
        ],
      }),
    );

    expect(paths).toEqual(expect.arrayContaining(['diagnoses', 'medicationRequests']));
  });
});
