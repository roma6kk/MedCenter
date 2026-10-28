import { resolveContentLanguage, translated, translationExtension } from './translation';

describe('resolveContentLanguage', () => {
  it.each([
    [undefined, 'ru'],
    ['', 'ru'],
    ['ru', 'ru'],
    ['ru-RU,ru;q=0.9', 'ru'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['en-US,en;q=0.9,ru;q=0.8', 'en'],
    ['ru;q=0.5,en;q=0.9', 'en'],
    ['de', 'ru'],
    ['de,fr;q=0.5', 'ru'],
    ['*', 'ru'],
    ['en;q=0', 'ru'],
    ['garbage;;;', 'ru'],
  ])('should resolve %j to %s', (header, expected) => {
    expect(resolveContentLanguage(header)).toBe(expected);
  });

  it('should read the first value of a repeated header', () => {
    expect(resolveContentLanguage(['en-GB', 'ru'])).toBe('en');
  });
});

describe('translationExtension', () => {
  it('should build the HL7 translation extension with lang and content', () => {
    expect(translationExtension('en', 'Therapist')).toEqual({
      url: 'http://hl7.org/fhir/StructureDefinition/translation',
      extension: [
        { url: 'lang', valueCode: 'en' },
        { url: 'content', valueString: 'Therapist' },
      ],
    });
  });
});

describe('translated', () => {
  const element = { extension: [translationExtension('en', 'Therapist')] };

  it('should return the English content when English is asked and present', () => {
    expect(translated('Терапевт', element, 'en')).toBe('Therapist');
  });

  it('should return the original when Russian is asked', () => {
    expect(translated('Терапевт', element, 'ru')).toBe('Терапевт');
  });

  it('should return the original when there is no translation', () => {
    expect(translated('Терапевт', undefined, 'en')).toBe('Терапевт');
    expect(translated('Терапевт', null, 'en')).toBe('Терапевт');
    expect(translated('Терапевт', { extension: [] }, 'en')).toBe('Терапевт');
  });

  it('should ignore a translation into another language or with blank content', () => {
    const german = { extension: [{ ...translationExtension('en', 'x'), extension: [{ url: 'lang', valueCode: 'de' }, { url: 'content', valueString: 'Therapeut' }] }] };
    const blank = { extension: [translationExtension('en', '   ')] };
    expect(translated('Терапевт', german, 'en')).toBe('Терапевт');
    expect(translated('Терапевт', blank, 'en')).toBe('Терапевт');
  });

  it('should skip unrelated extensions', () => {
    const mixed = { extension: [{ url: 'http://example.org/other', valueString: 'z' }, translationExtension('en', 'Therapist')] };
    expect(translated('Терапевт', mixed, 'en')).toBe('Therapist');
  });
});
