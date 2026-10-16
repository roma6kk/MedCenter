import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsString, Min, MinLength, ValidateNested } from 'class-validator';

import { createValidationPipe } from './validation.pipe';

class LineDto {
  @IsString()
  @MinLength(3)
  code!: string;
}

class FormDto {
  @IsEmail()
  email!: string;

  @IsInt()
  @Min(1)
  count!: number;

  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}

async function rejectionOf(value: unknown): Promise<BadRequestException> {
  try {
    await createValidationPipe().transform(value, { type: 'body', metatype: FormDto });
  } catch (error: unknown) {
    return error as BadRequestException;
  }
  throw new Error('the pipe accepted an invalid body');
}

describe('createValidationPipe', () => {
  it('should answer VALIDATION_ERROR with the violated field names in the message when the body is invalid', async () => {
    const error = await rejectionOf({ email: 'nope', count: 0, lines: [] });

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      message: expect.stringMatching(/email: .*; count: /),
    });
  });

  it('should list every violated constraint as a { field, message } detail', async () => {
    const error = await rejectionOf({ email: 'nope', count: 1, lines: [] });

    expect(error.getResponse()).toMatchObject({ details: [{ field: 'email', message: expect.stringContaining('email') }] });
  });

  it('should address a nested violation by its dotted path when an array element is invalid', async () => {
    const error = await rejectionOf({ email: 'a@b.by', count: 1, lines: [{ code: 'ok-1' }, { code: 'x' }] });

    expect(error.getResponse()).toMatchObject({ details: [{ field: 'lines.1.code', message: expect.any(String) }] });
  });

  it('should accept a valid body and drop properties no DTO declares', async () => {
    const value = await createValidationPipe().transform(
      { email: 'a@b.by', count: 2, lines: [{ code: 'abc' }], admin: true },
      { type: 'body', metatype: FormDto },
    );

    expect(value).not.toHaveProperty('admin');
  });
});
