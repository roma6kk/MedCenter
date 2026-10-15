import type { INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import request from 'supertest';

import { startWithAdmin, type AdminFixture } from './admin-fixture';
import { PATIENT_PASSWORD, bearer, signIn, type TokenBody } from './auth-flow-helpers';

// `jose` is pure ESM and Jest's CJS runtime cannot load it; the signature check is stubbed and the
// claims are decoded from the token the application actually signed (see `oauth.e2e-spec.ts`).
jest.mock('jose', () => ({
  createRemoteJWKSet: () => 'mocked-jwks',
  jwtVerify: async (token: string) => {
    const segment = token.split('.')[1] ?? '';
    const payload: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return { payload, protectedHeader: { alg: 'RS256' } };
  },
}));

const ICD10_VALUE_SET = 'https://fhir.by/ValueSet/InternClassificDiseases10';
const ICD10_SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';
const DOCTOR = { email: 'doctor@medcenter.by', password: 'D0ctor!Passw0rd' } as const;

const EXPANSION = {
  resourceType: 'ValueSet',
  expansion: { total: 1, contains: [{ system: ICD10_SYSTEM, code: 'J06.9', display: 'ОРВИ' }] },
};

/** API §2.3 — terminology reads over real HTTP, the real guard stack and a fake HAPI. */
describe('Terminology API (API 2.3.1–2.3.3)', () => {
  let fixture: AdminFixture;
  let app: INestApplication;
  let doctor: TokenBody;
  let patient: TokenBody;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());

  beforeAll(async () => {
    fixture = await startWithAdmin();
    app = fixture.app;
    await api()
      .post('/api/v1/admin/users')
      .set('authorization', fixture.adminAuthorization)
      .send({ ...DOCTOR, firstName: 'Пётр', lastName: 'Петров', roles: [Role.DOCTOR] })
      .expect(201);
    doctor = await signIn(app, DOCTOR);
    await api()
      .post('/api/v1/auth/register')
      .send({ email: 'p@example.by', firstName: 'Иван', lastName: 'Иванов', password: PATIENT_PASSWORD, birthDate: '1990-05-12' })
      .expect(201);
    patient = await signIn(app, { email: 'p@example.by', password: PATIENT_PASSWORD });
  });

  afterAll(async () => {
    await fixture?.close();
  });

  beforeEach(() => {
    fixture.started.fakes.fhir.operation.mockReset();
    fixture.started.fakes.fhir.operation.mockResolvedValue(EXPANSION);
  });

  describe('perimeter', () => {
    it('should answer 401 when no Bearer token is presented', async () => {
      await api().get(`/api/v1/terminology/expand?system=${encodeURIComponent(ICD10_VALUE_SET)}`).expect(401);
    });

    it('should answer 403 FORBIDDEN_SCOPE when a patient asks for an expansion', async () => {
      const response = await api()
        .get(`/api/v1/terminology/expand?system=${encodeURIComponent(ICD10_VALUE_SET)}`)
        .set('authorization', bearer(patient))
        .expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    });

    it('should answer 403 FORBIDDEN_ROLE when a doctor lists the ValueSets', async () => {
      const response = await api().get('/api/v1/terminology/value-sets').set('authorization', bearer(doctor)).expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
    });
  });

  describe('GET /api/v1/terminology/value-sets', () => {
    it('should list the seeded ValueSets for an administrator', async () => {
      fixture.started.fakes.fhir.search.mockResolvedValue({
        entry: [{ resource: { resourceType: 'ValueSet', url: ICD10_VALUE_SET, name: 'icd10' } }],
      });

      const response = await api().get('/api/v1/terminology/value-sets').set('authorization', fixture.adminAuthorization).expect(200);

      expect(response.body.items).toEqual([{ url: ICD10_VALUE_SET, name: 'icd10' }]);
      expect(response.body.meta).toMatchObject({ page: 1, totalItems: 1 });
    });
  });

  describe('GET /api/v1/terminology/value-sets/{url}/$expand', () => {
    it('should expand the URL-encoded canonical for a doctor', async () => {
      const response = await api()
        .get(`/api/v1/terminology/value-sets/${encodeURIComponent(ICD10_VALUE_SET)}/$expand?count=5`)
        .set('authorization', bearer(doctor))
        .expect(200);

      expect(fixture.started.fakes.fhir.operation).toHaveBeenCalledWith('ValueSet', '$expand', {
        url: ICD10_VALUE_SET,
        count: 5,
        offset: 0,
      });
      expect(response.body).toEqual({
        valueSet: ICD10_VALUE_SET,
        total: 1,
        items: [{ system: ICD10_SYSTEM, code: 'J06.9', display: 'ОРВИ' }],
      });
    });

    it('should refuse a canonical outside https://fhir.by/ValueSet/ without calling HAPI', async () => {
      const response = await api()
        .get(`/api/v1/terminology/value-sets/${encodeURIComponent('http://internal.example/ValueSet/x')}/$expand`)
        .set('authorization', bearer(doctor))
        .expect(400);

      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fixture.started.fakes.fhir.operation).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/terminology/expand', () => {
    it('should serve the combobox form of the expansion with the items it renders', async () => {
      const response = await api()
        .get(`/api/v1/terminology/expand?system=${encodeURIComponent(ICD10_VALUE_SET)}&filter=${encodeURIComponent('ОРВИ')}`)
        .set('authorization', bearer(doctor))
        .expect(200);

      expect(response.body.items).toEqual([{ system: ICD10_SYSTEM, code: 'J06.9', display: 'ОРВИ' }]);
      expect(response.headers['cache-control']).toBe('private, max-age=300');
    });

    it('should find a concept by the code prefix a doctor types', async () => {
      const response = await api()
        .get(`/api/v1/terminology/expand?system=${encodeURIComponent(ICD10_VALUE_SET)}&filter=j06`)
        .set('authorization', bearer(doctor))
        .expect(200);

      expect(response.body.items.map((item: { code: string }) => item.code)).toEqual(['J06.9']);
    });

    it('should answer an empty page when nothing matches the filter', async () => {
      const response = await api()
        .get(`/api/v1/terminology/expand?system=${encodeURIComponent(ICD10_VALUE_SET)}&filter=zzz`)
        .set('authorization', bearer(doctor))
        .expect(200);

      expect(response.body).toMatchObject({ total: 0, items: [] });
    });

    it('should answer 400 when count exceeds the maximum', async () => {
      await api()
        .get(`/api/v1/terminology/expand?system=${encodeURIComponent(ICD10_VALUE_SET)}&count=101`)
        .set('authorization', bearer(doctor))
        .expect(400);
    });

    it('should answer 400 when system is missing', async () => {
      await api().get('/api/v1/terminology/expand?filter=J06').set('authorization', bearer(doctor)).expect(400);
    });
  });

  describe('GET /api/v1/terminology/validate', () => {
    it('should answer valid=true with the display when HAPI confirms the code', async () => {
      fixture.started.fakes.fhir.operation.mockResolvedValue({
        resourceType: 'Parameters',
        parameter: [{ name: 'result', valueBoolean: true }, { name: 'display', valueString: 'ОРВИ' }],
      });

      const response = await api()
        .get(`/api/v1/terminology/validate?system=${encodeURIComponent(ICD10_SYSTEM)}&code=J06.9`)
        .set('authorization', bearer(doctor))
        .expect(200);

      expect(response.body).toEqual({ system: ICD10_SYSTEM, code: 'J06.9', valid: true, display: 'ОРВИ' });
    });

    it('should answer 400 when the code contains spaces', async () => {
      await api()
        .get(`/api/v1/terminology/validate?system=${encodeURIComponent(ICD10_SYSTEM)}&code=J06%209`)
        .set('authorization', bearer(doctor))
        .expect(400);
    });
  });
});
