import { cn } from './cn';

describe('cn', () => {
  it('should keep the last utility of a Tailwind group when two of them collide', () => {
    expect(cn('px-4 text-sm', 'px-6')).toBe('text-sm px-6');
  });

  it('should drop falsy parts when a class is conditional', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('should let a caller elevation replace the default one when the shadow tokens collide', () => {
    expect(cn('shadow-elev-1', 'shadow-elev-2')).toBe('shadow-elev-2');
  });

  it('should keep a text size and a text colour together when both are tokens', () => {
    expect(cn('text-sm text-primary-foreground', 'text-lg')).toBe('text-primary-foreground text-lg');
  });
});
