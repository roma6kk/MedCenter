import { MEDCENTER_EXT } from './extension-urls';

describe('MEDCENTER_EXT', () => {
  const urls = Object.values(MEDCENTER_EXT);

  it.each(urls)('%s should be an absolute URL (FHIR R4 Extension.url)', (url) => {
    expect(new URL(url).protocol).toBe('https:');
  });

  it('should give every extension its own URL', () => {
    // One URL per meaning and value type — no two extensions may share it.
    expect(new Set(urls).size).toBe(urls.length);
  });
});
