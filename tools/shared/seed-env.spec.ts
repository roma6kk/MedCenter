import { DEFAULT_FHIR_BASE_URL, readOptionalEnv, requireEnv, resolveFhirBaseUrl } from './seed-env';

describe('resolveFhirBaseUrl', () => {
  it('should use SEED_FHIR_BASE_URL when it is set', () => {
    const env = { SEED_FHIR_BASE_URL: 'http://fhir.test/fhir', FHIR_BASE_URL: 'http://hapi:8080/fhir' };

    expect(resolveFhirBaseUrl(env, jest.fn())).toBe('http://fhir.test/fhir');
  });

  it('should not warn when SEED_FHIR_BASE_URL is set next to the services FHIR_BASE_URL', () => {
    const warn = jest.fn();

    resolveFhirBaseUrl({ SEED_FHIR_BASE_URL: 'http://fhir.test/fhir', FHIR_BASE_URL: 'http://hapi:8080/fhir' }, warn);

    expect(warn).not.toHaveBeenCalled();
  });

  it('should ignore the services FHIR_BASE_URL and warn when no seed override is set', () => {
    const warn = jest.fn();

    const baseUrl = resolveFhirBaseUrl({ FHIR_BASE_URL: 'http://other-stand.test/fhir' }, warn);

    expect(baseUrl).toBe(DEFAULT_FHIR_BASE_URL);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SEED_FHIR_BASE_URL'));
    expect(warn).toHaveBeenCalledWith(expect.not.stringContaining('other-stand'));
  });

  it('should use the host-published HAPI without a warning when nothing is set', () => {
    const warn = jest.fn();

    expect(resolveFhirBaseUrl({}, warn)).toBe(DEFAULT_FHIR_BASE_URL);
    expect(warn).not.toHaveBeenCalled();
  });

  it('should treat a blank SEED_FHIR_BASE_URL as unset', () => {
    expect(resolveFhirBaseUrl({ SEED_FHIR_BASE_URL: '   ' }, jest.fn())).toBe(DEFAULT_FHIR_BASE_URL);
  });
});

describe('readOptionalEnv', () => {
  it('should trim a value and return undefined for an empty one', () => {
    expect(readOptionalEnv({ A: ' x ', B: '' }, 'A')).toBe('x');
    expect(readOptionalEnv({ A: ' x ', B: '' }, 'B')).toBeUndefined();
  });
});

describe('requireEnv', () => {
  it('should return the trimmed value when it is set', () => {
    expect(requireEnv({ NAME: ' value ' }, 'NAME')).toBe('value');
  });

  it('should name the missing variable without echoing any value when it is unset', () => {
    expect(() => requireEnv({ OTHER: 'secret-value' }, 'BOOTSTRAP_ADMIN_PASSWORD')).toThrow(
      'Environment variable BOOTSTRAP_ADMIN_PASSWORD is required',
    );
  });
});
