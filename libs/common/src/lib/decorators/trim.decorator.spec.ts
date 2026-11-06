import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString, MinLength, validate } from 'class-validator';

import { Trim } from './trim.decorator';

class Sample {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(3)
  text?: string;
}

async function checked(body: Record<string, unknown>): Promise<{ text: unknown; invalid: string[] }> {
  const instance = plainToInstance(Sample, body);
  const errors = await validate(instance);
  return { text: instance.text, invalid: errors.map((error) => error.property) };
}

describe('Trim', () => {
  it('should hand the validators the text without its padding when the string has leading and trailing spaces', async () => {
    const result = await checked({ text: '  Болит спина \n' });

    expect(result).toEqual({ text: 'Болит спина', invalid: [] });
  });

  it('should fail the length bound when the text is only whitespace', async () => {
    const result = await checked({ text: '     ' });

    expect(result).toEqual({ text: '', invalid: ['text'] });
  });

  it('should count real characters when padding would otherwise satisfy the minimum', async () => {
    const result = await checked({ text: '  ab  ' });

    expect(result.invalid).toEqual(['text']);
  });

  it('should leave a value that is not a string for @IsString to refuse', async () => {
    const result = await checked({ text: 12345 });

    expect(result).toEqual({ text: 12345, invalid: ['text'] });
  });

  it('should keep an absent property absent', async () => {
    const result = await checked({});

    expect(result).toEqual({ text: undefined, invalid: [] });
  });
});
