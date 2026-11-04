import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateRoomDto } from './create-room.dto';
import { UpdateRoomDto } from './update-room.dto';

/** The body as the validation pipe sees it: transformed first, validated second. */
async function check<T extends object>(dtoClass: new () => T, body: Record<string, unknown>): Promise<{ dto: T; fields: string[] }> {
  const dto = plainToInstance(dtoClass, body);
  return { dto, fields: (await validate(dto)).map((error) => error.property) };
}

describe.each([
  ['CreateRoomDto', CreateRoomDto, { identifier: '204' }],
  ['UpdateRoomDto', UpdateRoomDto, {}],
])('%s name', (_name, dtoClass, rest) => {
  it('should store the trimmed name when it comes padded with spaces', async () => {
    const { dto, fields } = await check(dtoClass, { ...rest, name: '  Кабинет 204 ' });

    expect(fields).toEqual([]);
    expect(dto).toHaveProperty('name', 'Кабинет 204');
  });

  it.each(['', '   ', '\t \n'])('should reject the name when it is blank (%j)', async (name) => {
    expect((await check(dtoClass, { ...rest, name })).fields).toContain('name');
  });

  it.each([['null', null], ['a number', 204]])('should reject %s as the name', async (_label, name) => {
    expect((await check(dtoClass, { ...rest, name })).fields).toContain('name');
  });
});

describe.each([
  ['CreateRoomDto', CreateRoomDto, { identifier: '204', name: 'Кабинет' }],
  ['UpdateRoomDto', UpdateRoomDto, {}],
])('%s description', (_name, dtoClass, rest) => {
  it('should trim the description, so a blank text reaches the service as an empty one', async () => {
    const blank = await check(dtoClass, { ...rest, description: '   ' });
    const padded = await check(dtoClass, { ...rest, description: '  Окна во двор ' });

    expect(blank.fields).toEqual([]);
    expect(blank.dto).toHaveProperty('description', '');
    expect(padded.dto).toHaveProperty('description', 'Окна во двор');
  });

  it('should accept null as no description', async () => {
    const { dto, fields } = await check(dtoClass, { ...rest, description: null });

    expect(fields).toEqual([]);
    expect(dto).toHaveProperty('description', null);
  });

  it.each([['a number', 7], ['a text above 500 characters', 'x'.repeat(501)]])('should reject %s', async (_label, description) => {
    expect((await check(dtoClass, { ...rest, description })).fields).toContain('description');
  });
});

describe('UpdateRoomDto floor', () => {
  it('should accept null, which removes the floor', async () => {
    const { dto, fields } = await check(UpdateRoomDto, { floor: null });

    expect(fields).toEqual([]);
    expect(dto).toHaveProperty('floor', null);
  });

  it.each([['0', 0], ['11', 11], ['a fraction', 2.5], ['text', 'second']])('should still refuse floor %s', async (_label, floor) => {
    expect((await check(UpdateRoomDto, { floor })).fields).toContain('floor');
  });
});

describe('UpdateRoomDto fields that may be left out', () => {
  it('should accept a body without them', async () => {
    expect((await check(UpdateRoomDto, {})).fields).toEqual([]);
  });

  it.each(['identifier', 'name'])('should refuse null for %s: a room cannot lose it', async (field) => {
    expect((await check(UpdateRoomDto, { [field]: null })).fields).toContain(field);
  });
});
