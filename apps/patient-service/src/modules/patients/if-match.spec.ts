import { versionFromIfMatch } from './if-match';

describe('versionFromIfMatch', () => {
  it.each([
    ['W/"3"', '3'],
    ['"3"', '3'],
    ['3', '3'],
    ['  W/"12" ', '12'],
  ])('should read the version out of %s', (header, expected) => {
    expect(versionFromIfMatch(header)).toBe(expected);
  });

  it.each([undefined, '', '   ', '*', 'W/""', '"a b"', '1,2', 'W/"3"x'])(
    'should return null when the header is %p',
    (header) => {
      expect(versionFromIfMatch(header)).toBeNull();
    },
  );
});
