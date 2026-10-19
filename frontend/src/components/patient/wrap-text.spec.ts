import { WRAP_TEXT } from './wrap-text';

describe('WRAP_TEXT', () => {
  it('should allow a break anywhere and let the item shrink below its content width', () => {
    const classes: ReadonlyArray<string> = WRAP_TEXT.split(' ');

    expect(classes).toEqual(expect.arrayContaining(['min-w-0', '[overflow-wrap:anywhere]']));
  });
});
