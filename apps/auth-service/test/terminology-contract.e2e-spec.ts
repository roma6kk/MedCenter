import type { INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import { FhirClientError, type FhirResource } from '@medcenter/fhir';
import request from 'supertest';

import { startWithAdmin, type AdminFixture } from './admin-fixture';
import { bearer, signIn, type TokenBody } from './auth-flow-helpers';
import { ICD10_SYSTEM, ICD10_VALUE_SET } from './endpoint-catalog';
import { expectProblem } from './problem-assertions';
import { staffBody } from './users-helpers';

jest.mock(
  'jose',
  () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub,
);

const HAPI_URL = 'http://hapi.internal:8080/fhir';
const ATC_SYSTEM = 'http://www.whocc.no/atc';
const DOCTOR = { email: 'terminology-doctor@medcenter.by', password: 'D0ctor!Passw0rd' } as const;

const J06 = { system: ICD10_SYSTEM, code: 'J06.9', display: 'ОРВИ' };
const J01 = { system: ICD10_SYSTEM, code: 'J01.9', display: 'Острый синусит' };

function expansionOf(...concepts: ReadonlyArray<Record<string, string>>): FhirResource {
  return { resourceType: 'ValueSet', expansion: { total: concepts.length, contains: concepts } };
}

function validationOf(result: boolean, display?: string): FhirResource {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'result', valueBoolean: result },
      ...(display === undefined ? [] : [{ name: 'display', valueString: display }]),
    ],
  };
}

/** API §2.3.1–2.3.3: request validation, what is asked of HAPI, caching and how HAPI failures reach the client. */
describe('Terminology API — contract and error mapping', () => {
  let fixture: AdminFixture;
  let app: INestApplication;
  let doctor: TokenBody;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());
  const hapi = (): AdminFixture['started']['fakes']['fhir'] => fixture.started.fakes.fhir;
  const asDoctor = (path: string): request.Test =>
    api().get(path).set('authorization', bearer(doctor));
  const expand = (valueSet: string, query = ''): request.Test =>
    asDoctor(`/api/v1/terminology/expand?system=${encodeURIComponent(valueSet)}${query}`);
  const validate = (system: string, code: string): request.Test =>
    asDoctor(
      `/api/v1/terminology/validate?system=${encodeURIComponent(system)}&code=${encodeURIComponent(code)}`,
    );

  beforeAll(async () => {
    fixture = await startWithAdmin();
    app = fixture.app;
    await api()
      .post('/api/v1/admin/users')
      .set('authorization', fixture.adminAuthorization)
      .send(staffBody(DOCTOR.email, [Role.DOCTOR]))
      .expect(201);
    doctor = await signIn(app, DOCTOR);
  });

  afterAll(async () => {
    await fixture?.close();
  });

  beforeEach(() => {
    hapi().operation.mockReset();
    hapi().search.mockReset();
  });

  describe('request validation', () => {
    it.each([
      [
        'value-sets/{url} outside the national canonical',
        `/api/v1/terminology/value-sets/${encodeURIComponent('https://evil.example/ValueSet/x')}/$expand`,
      ],
      [
        'value-sets/{url} that is not a canonical at all',
        '/api/v1/terminology/value-sets/icd10/$expand',
      ],
      ['expand without system', '/api/v1/terminology/expand'],
      [
        'expand with count 0',
        `/api/v1/terminology/expand?system=${encodeURIComponent(ICD10_VALUE_SET)}&count=0`,
      ],
      [
        'expand with a negative offset',
        `/api/v1/terminology/expand?system=${encodeURIComponent(ICD10_VALUE_SET)}&offset=-1`,
      ],
      [
        'expand with a filter over 100 characters',
        `/api/v1/terminology/expand?system=${encodeURIComponent(ICD10_VALUE_SET)}&filter=${'x'.repeat(101)}`,
      ],
      [
        'validate without a code',
        `/api/v1/terminology/validate?system=${encodeURIComponent(ICD10_SYSTEM)}`,
      ],
      ['validate without a system', '/api/v1/terminology/validate?code=J06.9'],
      [
        'validate with a system that is not an http(s) URI',
        '/api/v1/terminology/validate?system=urn:oid:1.2&code=J06.9',
      ],
      [
        'validate with a code of 65 characters',
        `/api/v1/terminology/validate?system=${encodeURIComponent(ICD10_SYSTEM)}&code=${'J'.repeat(65)}`,
      ],
    ])(
      'should answer 400 VALIDATION_ERROR without calling HAPI when the request is %s',
      async (_label, path) => {
        const response = await asDoctor(path);

        expectProblem(response, 400, 'VALIDATION_ERROR');
        expect(hapi().operation).not.toHaveBeenCalled();
      },
    );
  });

  describe('GET /api/v1/terminology/value-sets/{url}/$expand and /expand', () => {
    it('should ask HAPI for the first page with the default count of 20 when no paging is given', async () => {
      hapi().operation.mockResolvedValue(expansionOf(J06));

      await expand(ICD10_VALUE_SET).expect(200);

      expect(hapi().operation).toHaveBeenCalledWith('ValueSet', '$expand', {
        url: ICD10_VALUE_SET,
        count: 20,
        offset: 0,
      });
    });

    it('should serve the second request from the cache when the same page is asked twice', async () => {
      const valueSet = 'https://fhir.by/ValueSet/atc';
      hapi().operation.mockResolvedValue(
        expansionOf({ system: ATC_SYSTEM, code: 'J01FA10', display: 'Азитромицин' }),
      );

      const first = await expand(valueSet).expect(200);
      const second = await expand(valueSet).expect(200);

      expect(hapi().operation).toHaveBeenCalledTimes(1);
      expect(second.body).toEqual(first.body);
    });

    it('should scan the whole ValueSet once and filter it here when different filters are typed', async () => {
      const valueSet = 'https://fhir.by/ValueSet/nsi-services';
      hapi().operation.mockResolvedValue(expansionOf(J06, J01));

      const byCode = await expand(valueSet, '&filter=J01').expect(200);
      const byDisplay = await expand(valueSet, '&filter=орви').expect(200);

      expect(byCode.body).toMatchObject({ total: 1, items: [J01] });
      expect(byDisplay.body).toMatchObject({ total: 1, items: [J06] });
      expect(hapi().operation).toHaveBeenCalledTimes(1);
    });

    it('should page the filtered concepts with count and offset when a filter and paging are combined', async () => {
      const valueSet = 'https://fhir.by/ValueSet/ucum-units';
      hapi().operation.mockResolvedValue(expansionOf(J06, J01));

      const response = await expand(valueSet, '&filter=J&count=1&offset=1').expect(200);

      expect(response.body).toEqual({ valueSet, total: 2, items: [J01] });
    });

    it('should mark the expansion private and cacheable for five minutes on both routes', async () => {
      hapi().operation.mockResolvedValue(expansionOf(J06));
      const path = `/api/v1/terminology/value-sets/${encodeURIComponent('https://fhir.by/ValueSet/cache-header')}/$expand`;

      const response = await asDoctor(path).expect(200);

      expect(response.headers['cache-control']).toBe('private, max-age=300');
    });

    it('should answer 404 NOT_FOUND naming the ValueSet when HAPI does not know it', async () => {
      hapi().operation.mockRejectedValue(new FhirClientError('POST', HAPI_URL, 404));

      const response = await expand('https://fhir.by/ValueSet/not-seeded');

      expectProblem(response, 404, 'NOT_FOUND');
      expect(response.body.detail).toContain('https://fhir.by/ValueSet/not-seeded');
    });

    it.each([
      ['rejects the request we built', 400, 500],
      ['is unavailable', 503, 502],
    ])(
      'should answer %s as an internal error without leaking the HAPI address when HAPI %s',
      async (_label, upstream, status) => {
        hapi().operation.mockRejectedValue(new FhirClientError('POST', HAPI_URL, upstream));

        const response = await expand('https://fhir.by/ValueSet/broken');

        expectProblem(response, status, 'INTERNAL');
        expect(JSON.stringify(response.body)).not.toContain('hapi.internal');
      },
    );

    it('should answer 504 when HAPI times out while the expansion is read', async () => {
      hapi().operation.mockRejectedValue(
        new FhirClientError('POST', HAPI_URL, undefined, undefined, { timedOut: true }),
      );

      expectProblem(await expand('https://fhir.by/ValueSet/slow'), 504, 'INTERNAL');
    });
  });

  describe('GET /api/v1/terminology/validate', () => {
    it('should ask HAPI to validate the code against the seeded ValueSet of its system', async () => {
      hapi().operation.mockResolvedValue(validationOf(true, 'ОРВИ'));

      const response = await validate(ICD10_SYSTEM, 'J06.9').expect(200);

      expect(hapi().operation).toHaveBeenCalledWith('ValueSet', '$validate-code', {
        url: ICD10_VALUE_SET,
        system: ICD10_SYSTEM,
        code: 'J06.9',
      });
      expect(response.body).toEqual({
        system: ICD10_SYSTEM,
        code: 'J06.9',
        valid: true,
        display: 'ОРВИ',
      });
    });

    it('should answer valid=false when HAPI does not accept the code', async () => {
      hapi().operation.mockResolvedValue(validationOf(false));

      const response = await validate(ICD10_SYSTEM, 'Z99.9').expect(200);

      expect(response.body).toEqual({ system: ICD10_SYSTEM, code: 'Z99.9', valid: false });
    });

    it.each([
      ['a malformed ICD-10 code', ICD10_SYSTEM, 'J'],
      ['a malformed ATC code', ATC_SYSTEM, 'XYZ'],
      ['a system outside the seed', 'https://example.org/CodeSystem/other', 'A1'],
    ])(
      'should answer valid=false without asking HAPI when the pair is %s',
      async (_label, system, code) => {
        const response = await validate(system, code).expect(200);

        expect(response.body).toEqual({ system, code, valid: false });
        expect(hapi().operation).not.toHaveBeenCalled();
      },
    );

    it.each([404, 422])(
      'should answer valid=false rather than an error when HAPI answers %i for the ValueSet',
      async (upstream) => {
        hapi().operation.mockRejectedValue(new FhirClientError('POST', HAPI_URL, upstream));

        const response = await validate(ICD10_SYSTEM, 'J06.9').expect(200);

        expect(response.body).toMatchObject({ valid: false });
      },
    );

    it('should not turn a HAPI 400 into valid=false because it is a defect of this service', async () => {
      hapi().operation.mockRejectedValue(new FhirClientError('POST', HAPI_URL, 400));

      expectProblem(await validate(ICD10_SYSTEM, 'J06.9'), 500, 'INTERNAL');
    });

    it('should answer 502 when HAPI is unavailable while the code is validated', async () => {
      hapi().operation.mockRejectedValue(new FhirClientError('POST', HAPI_URL, 503));

      expectProblem(await validate(ICD10_SYSTEM, 'J06.9'), 502, 'INTERNAL');
    });
  });

  describe('GET /api/v1/terminology/value-sets', () => {
    it('should search only the national ValueSets and answer them ordered by canonical in the paginated envelope', async () => {
      hapi().search.mockResolvedValue({
        entry: [
          {
            resource: {
              resourceType: 'ValueSet',
              url: 'https://fhir.by/ValueSet/ucum-units',
              name: 'ucum',
              status: 'active',
            },
          },
          { resource: { resourceType: 'ValueSet', url: 'https://other.example/ValueSet/x' } },
          {
            resource: {
              resourceType: 'ValueSet',
              url: ICD10_VALUE_SET,
              name: 'icd10',
              version: '2024',
            },
          },
        ],
      });

      const response = await api()
        .get('/api/v1/terminology/value-sets')
        .set('authorization', fixture.adminAuthorization)
        .expect(200);

      expect(hapi().search).toHaveBeenCalledWith('ValueSet', {
        'url:below': 'https://fhir.by/ValueSet/',
        _count: 100,
        _elements: 'url,name,title,version,status',
      });
      expect(response.body.items).toEqual([
        { url: ICD10_VALUE_SET, name: 'icd10', version: '2024' },
        { url: 'https://fhir.by/ValueSet/ucum-units', name: 'ucum', status: 'active' },
      ]);
      expect(response.body.meta).toEqual({ page: 1, pageSize: 100, totalItems: 2, totalPages: 1 });
    });

    it('should answer 502 when HAPI is unavailable while the ValueSets are listed', async () => {
      hapi().search.mockRejectedValue(new FhirClientError('GET', HAPI_URL, 503));

      const response = await api()
        .get('/api/v1/terminology/value-sets')
        .set('authorization', fixture.adminAuthorization);

      expectProblem(response, 502, 'INTERNAL');
    });
  });
});
