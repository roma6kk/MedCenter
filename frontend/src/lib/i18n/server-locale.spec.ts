/** @jest-environment node */
const getMock = jest.fn();
jest.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: getMock }) }));

import { readServerLocale } from './server-locale';

describe('readServerLocale', () => {
  beforeEach(() => getMock.mockReset());

  it('should read the locale the client stored in the cookie', async () => {
    getMock.mockReturnValue({ value: 'en' });
    expect(await readServerLocale()).toBe('en');
    expect(getMock).toHaveBeenCalledWith('mc-locale');
  });

  it('should fall back to Russian when there is no cookie or it is junk', async () => {
    getMock.mockReturnValue(undefined);
    expect(await readServerLocale()).toBe('ru');
    getMock.mockReturnValue({ value: 'de' });
    expect(await readServerLocale()).toBe('ru');
  });
});
