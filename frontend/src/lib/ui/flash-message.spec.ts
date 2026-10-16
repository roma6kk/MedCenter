import { consumeFlash, setFlash } from './flash-message';

describe('flash-message', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('should hand a message over once', () => {
    setFlash('session-ended');

    expect(consumeFlash()).toBe('session-ended');
    expect(consumeFlash()).toBeNull();
  });

  it('should ignore a stored value that is not a known flash', () => {
    window.sessionStorage.setItem('mc-flash', '<script>');

    expect(consumeFlash()).toBeNull();
  });

  it('should not throw when storage is blocked', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(() => setFlash('session-ended')).not.toThrow();
    expect(consumeFlash()).toBeNull();

    jest.restoreAllMocks();
  });
});
