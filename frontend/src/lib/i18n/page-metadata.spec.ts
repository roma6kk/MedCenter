import { pageMetadata, rootMetadata } from './page-metadata';

describe('pageMetadata', () => {
  it('should return the Russian title of the catalogue key when a page names itself', () => {
    expect(pageMetadata('doctor.journal.title')).toEqual({ title: 'Журнал приёмов' });
  });

  it('should hand back the key path when the key is missing instead of throwing', () => {
    expect(pageMetadata('nope.title')).toEqual({ title: 'nope.title' });
  });
});

describe('rootMetadata', () => {
  it('should default to the clinic name and add the brand to a page title when a page names itself', () => {
    const metadata = rootMetadata();

    expect(metadata.title).toEqual({ default: 'Медицинский центр', template: '%s — МедЦентр' });
    expect(metadata.description).toBe('Запись на приём и клиническая документация');
  });
});
