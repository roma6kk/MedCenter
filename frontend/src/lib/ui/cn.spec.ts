import { cn } from './cn';

describe('cn', () => {
  it('should keep the last utility of a Tailwind group when two of them collide', () => {
    expect(cn('px-4 text-sm', 'px-6')).toBe('text-sm px-6');
  });

  it('should drop falsy parts when a class is conditional', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });
});
