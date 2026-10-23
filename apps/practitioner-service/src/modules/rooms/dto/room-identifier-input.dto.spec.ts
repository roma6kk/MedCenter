import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateRoomDto } from './create-room.dto';
import { UpdateRoomDto } from './update-room.dto';

describe.each([
  ['CreateRoomDto', CreateRoomDto, { name: 'Кабинет' }],
  ['UpdateRoomDto', UpdateRoomDto, {}],
])('%s identifier', (_name, dtoClass, rest) => {
  it('should store the trimmed identifier when it comes padded with spaces', async () => {
    const dto = plainToInstance(dtoClass, { ...rest, identifier: ' 204 ' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.identifier).toBe('204');
  });

  it.each(['', '   ', '\t \n'])('should reject the identifier when it is blank (%j)', async (identifier) => {
    const errors = await validate(plainToInstance(dtoClass, { ...rest, identifier }));

    expect(errors.map((error) => error.property)).toContain('identifier');
  });

  it('should keep a non-string identifier for the validator to refuse', async () => {
    const errors = await validate(plainToInstance(dtoClass, { ...rest, identifier: 204 }));

    expect(errors.map((error) => error.property)).toContain('identifier');
  });
});
