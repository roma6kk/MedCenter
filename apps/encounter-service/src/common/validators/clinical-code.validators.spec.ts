import 'reflect-metadata';
import { validate } from 'class-validator';

import { MatchesATC } from './matches-atc.validator';
import { MatchesICD10 } from './matches-icd10.validator';

class Prescription {
  @MatchesATC()
  atcCode!: string;
}

class Diagnosis {
  @MatchesICD10()
  code!: string;
}

async function messagesOf(target: object): Promise<string[]> {
  const errors = await validate(target);
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('clinical code validators', () => {
  it('should word an ATC failure as the property followed by must be an ATC code with an example when the code is malformed', async () => {
    const messages = await messagesOf(Object.assign(new Prescription(), { atcCode: 'J01' }));

    expect(messages).toEqual(['atcCode must be an ATC code such as J01FA10']);
  });

  it('should word an ICD-10 failure the same way when the code is malformed', async () => {
    const messages = await messagesOf(Object.assign(new Diagnosis(), { code: 'орви' }));

    expect(messages).toEqual(['code must be an ICD-10 code such as J06.9']);
  });

  it('should accept a level 5 ATC code and a three-character ICD-10 category', async () => {
    expect(await messagesOf(Object.assign(new Prescription(), { atcCode: 'J01FA10' }))).toEqual([]);
    expect(await messagesOf(Object.assign(new Diagnosis(), { code: 'J06.9' }))).toEqual([]);
  });

  it('should reject a code that is not a string', async () => {
    expect(await messagesOf(Object.assign(new Prescription(), { atcCode: 7 }))).toHaveLength(1);
  });
});
