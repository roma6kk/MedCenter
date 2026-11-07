import type { AdminRoom } from './room-types';

export function roomLabel(room: Pick<AdminRoom, 'name' | 'identifier'>): string {
  const name: string = room.name.trim();
  const identifier: string = room.identifier.trim();
  if (identifier === '' || name.includes(identifier)) return name;
  return name === '' ? identifier : `${name} (${identifier})`;
}
