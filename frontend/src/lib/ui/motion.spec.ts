import { motionSafeScrollBehavior } from './motion';

describe('motionSafeScrollBehavior', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it('should scroll smoothly when the visitor has not asked for reduced motion', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });

    expect(motionSafeScrollBehavior()).toBe('smooth');
  });

  it('should jump when the visitor asked for reduced motion', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });

    expect(motionSafeScrollBehavior()).toBe('auto');
  });

  it('should answer smooth in an engine without matchMedia', () => {
    // @ts-expect-error the test engine has no matchMedia
    window.matchMedia = undefined;

    expect(motionSafeScrollBehavior()).toBe('smooth');
  });
});
