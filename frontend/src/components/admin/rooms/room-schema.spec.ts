import { EMPTY_ROOM_VALUES, roomSchema, roomValuesOf, toRoomPayload } from './room-schema';
import type { AdminRoom } from './room-types';

const room: AdminRoom = { id: 'r1', identifier: '204-Х', name: 'Кабинет 204', floor: 2, description: 'Кардиолог', isActive: true };

function failing(values: Partial<typeof EMPTY_ROOM_VALUES>): ReadonlyArray<string> {
  const result = roomSchema.safeParse({ ...EMPTY_ROOM_VALUES, identifier: 'A1', name: 'Кабинет', ...values });
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('roomSchema', () => {
  it('should accept the form when only the identifier and the name are filled', () => {
    expect(failing({})).toEqual([]);
  });

  it('should require the identifier and the name when they are empty', () => {
    expect(failing({ identifier: ' ', name: '' })).toEqual(expect.arrayContaining(['identifier', 'name']));
  });

  it.each(['0', '11', '1.5', '-1', 'abc'])('should refuse the floor %s when the form is checked', (floor) => {
    expect(failing({ floor })).toContain('floor');
  });

  it.each(['', '1', '10'])('should accept the floor %j when the form is checked', (floor) => {
    expect(failing({ floor })).toEqual([]);
  });

  it('should refuse an identifier over 50 characters and a description over 500 when the form is checked', () => {
    expect(failing({ identifier: 'x'.repeat(51), description: 'y'.repeat(501) })).toEqual(expect.arrayContaining(['identifier', 'description']));
  });
});

describe('toRoomPayload', () => {
  it('should leave the empty floor and description out when a new room is built', () => {
    expect(toRoomPayload({ identifier: ' A1 ', name: ' Кабинет ', floor: '', description: '' }, false)).toEqual({ identifier: 'A1', name: 'Кабинет' });
  });

  it('should send an empty description when a room is edited, so that it clears the old one', () => {
    expect(toRoomPayload({ ...roomValuesOf(room), description: '' }, true)).toMatchObject({ description: '' });
  });

  it('should send the floor as a number when it is filled', () => {
    expect(toRoomPayload(roomValuesOf(room), false)).toMatchObject({ floor: 2 });
  });
});

describe('roomValuesOf', () => {
  it('should turn a room without floor and description into empty form values when it is opened for edit', () => {
    expect(roomValuesOf({ id: 'r2', identifier: 'B', name: 'N', isActive: true })).toEqual({ identifier: 'B', name: 'N', floor: '', description: '' });
  });
});
