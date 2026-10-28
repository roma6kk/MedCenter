import type { AdminRoom } from './room-types';

/**
 * How a room is named wherever it is picked or listed (D8): its name once. «Кабинет 101» already says «101», so the
 * identifier is added only when the name does not carry it («Процедурная (12)»).
 */
export function roomLabel(room: Pick<AdminRoom, 'name' | 'identifier'>): string {
  const name: string = room.name.trim();
  const identifier: string = room.identifier.trim();
  if (identifier === '' || name.includes(identifier)) return name;
  return name === '' ? identifier : `${name} (${identifier})`;
}
