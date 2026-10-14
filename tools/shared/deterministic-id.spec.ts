import { seedResourceId, SEED_ID_NAMESPACE, uuidV5 } from './deterministic-id';

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** RFC 4122 appendix B namespace for DNS names. */
const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('uuidV5', () => {
  it('should match the published SHA-1 name-based vector when the DNS namespace is used', () => {
    expect(uuidV5('www.example.com', DNS_NAMESPACE)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('should return the same id every time when the name is the same', () => {
    expect(uuidV5('Practitioner/ivanova')).toBe(uuidV5('Practitioner/ivanova'));
  });

  it('should return a different id when the name differs', () => {
    expect(uuidV5('Practitioner/ivanova')).not.toBe(uuidV5('Practitioner/petrov'));
  });

  it('should return a canonical version 5 UUID that satisfies the FHIR id grammar', () => {
    const id = uuidV5('anything');

    expect(id).toMatch(UUID_V5);
    expect(id).toMatch(/^[A-Za-z0-9\-.]{1,64}$/);
  });

  it('should reject a namespace that is not a UUID', () => {
    expect(() => uuidV5('x', 'not-a-uuid')).toThrow(/not a UUID/);
  });

  it('should key every seeded id by the fixed workspace namespace', () => {
    expect(uuidV5('x')).toBe(uuidV5('x', SEED_ID_NAMESPACE));
  });
});

describe('seedResourceId', () => {
  it('should give the same business key a different id per resource type', () => {
    expect(seedResourceId('Practitioner', 'ivanova')).not.toBe(seedResourceId('PractitionerRole', 'ivanova'));
  });

  it('should be the id of "<type>/<key>"', () => {
    expect(seedResourceId('Location', 'room-101')).toBe(uuidV5('Location/room-101'));
  });
});
