import { roomLabel } from './room-label';

describe('roomLabel', () => {
  it('should show the name once when it already carries the identifier', () => {
    expect(roomLabel({ name: 'Кабинет 101', identifier: '101' })).toBe('Кабинет 101');
  });

  it('should add the identifier when the name does not carry it', () => {
    expect(roomLabel({ name: 'Процедурная', identifier: '12' })).toBe('Процедурная (12)');
  });

  it('should fall back to the identifier for a nameless room and to the name for a room without identifier', () => {
    expect(roomLabel({ name: ' ', identifier: '7' })).toBe('7');
    expect(roomLabel({ name: 'Зал', identifier: '' })).toBe('Зал');
  });
});
