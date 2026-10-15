import type { INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import request from 'supertest';

import { TerminologyImportService } from '../src/modules/terminology/import/terminology-import.service';
import { SNAPSHOT_VERSION } from '../src/modules/terminology/import/snapshot-resources';
import { createFakeTerminologyHapi } from '../src/modules/terminology/import/__tests__/fake-terminology-hapi';
import { startWithAdmin, type AdminFixture } from './admin-fixture';
import { PATIENT_PASSWORD, bearer, signIn, type TokenBody } from './auth-flow-helpers';

// `jose` is pure ESM and Jest's CJS runtime cannot load it; see `terminology.e2e-spec.ts`.
jest.mock('jose', () => ({
  createRemoteJWKSet: () => 'mocked-jwks',
  jwtVerify: async (token: string) => {
    const segment = token.split('.')[1] ?? '';
    const payload: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return { payload, protectedHeader: { alg: 'RS256' } };
  },
}));

const IMPORT_URL = '/api/v1/admin/terminology/import';
const ICD10_VALUE_SET = 'https://fhir.by/ValueSet/InternClassificDiseases10';
const DOCTOR = { email: 'doctor@medcenter.by', password: 'D0ctor!Passw0rd' } as const;
/** Snapshot resources: 4 CodeSystems (UCUM is an external system) + 5 ValueSets. */
const RESOURCE_COUNT = 9;

interface Deferred {
  readonly promise: Promise<void>;
  readonly open: () => void;
}

/** `sub` claim of a token this application signed. */
function subOf(token: TokenBody): string {
  const segment = token.access_token.split('.')[1] ?? '';
  const claims: { sub?: string } = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  return claims.sub ?? '';
}

function gate(): Deferred {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** API §2.3.4 — the snapshot import over real HTTP, the real guard stack and a stateful fake HAPI. */
describe('Terminology import API (API 2.3.4)', () => {
  let fixture: AdminFixture;
  let app: INestApplication;
  let doctor: TokenBody;
  let patient: TokenBody;
  let imports: TerminologyImportService;
  const hapi = createFakeTerminologyHapi();

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());
  const importAs = (authorization: string, body: object = { snapshotVersion: SNAPSHOT_VERSION }): request.Test =>
    api().post(IMPORT_URL).set('authorization', authorization).send(body);
  const importAudits = (): ReadonlyArray<Record<string, unknown>> =>
    fixture.started.fakes.fhir.create.mock.calls
      .filter(([type]) => type === 'AuditEvent')
      .map(([, resource]) => resource as unknown as Record<string, unknown>)
      .filter((event) => JSON.stringify(event).includes('terminology.import'));

  beforeAll(async () => {
    fixture = await startWithAdmin();
    app = fixture.app;
    imports = fixture.started.moduleRef.get(TerminologyImportService);
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

  beforeEach(async () => {
    await imports.whenIdle();
    hapi.store.clear();
    const fhir = fixture.started.fakes.fhir;
    fhir.create.mockClear();
    for (const method of ['search', 'update', 'delete', 'operation'] as const) {
      fhir[method].mockReset();
      fhir[method].mockImplementation(hapi[method].getMockImplementation() as never);
    }
  });

  describe('perimeter', () => {
    it('should answer 401 when no Bearer token is presented', async () => {
      await api().post(IMPORT_URL).send({ snapshotVersion: SNAPSHOT_VERSION }).expect(401);
    });

    it('should answer 403 FORBIDDEN_SCOPE when a patient starts an import', async () => {
      const response = await importAs(bearer(patient)).expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    });

    it('should answer 403 FORBIDDEN_ROLE when a doctor starts an import', async () => {
      const response = await importAs(bearer(doctor)).expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
      expect(fixture.started.fakes.fhir.update).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it.each([[{}], [{ snapshotVersion: '' }], [{ snapshotVersion: 'latest' }], [{ snapshotVersion: 142 }]])(
      'should answer 400 VALIDATION_ERROR without touching HAPI when the body is %j',
      async (body) => {
        const response = await importAs(fixture.adminAuthorization, body).expect(400);

        expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
        expect(fixture.started.fakes.fhir.update).not.toHaveBeenCalled();
      },
    );

    it('should answer 422 TERMINOLOGY_NOT_FOUND when the snapshot version is not bundled', async () => {
      const response = await importAs(fixture.adminAuthorization, { snapshotVersion: '9.9.9' }).expect(422);

      expect(response.body).toMatchObject({ errorCode: 'TERMINOLOGY_NOT_FOUND' });
      expect(response.body.detail).toContain(SNAPSHOT_VERSION);
    });
  });

  describe('POST /api/v1/admin/terminology/import', () => {
    it('should answer 202 Accepted with the import id when an administrator starts the import', async () => {
      const response = await importAs(fixture.adminAuthorization).expect(202);
      await imports.whenIdle();

      expect(response.body).toMatchObject({ snapshotVersion: SNAPSHOT_VERSION, status: 'ACCEPTED' });
      expect(response.body.importId).toEqual(expect.any(String));
    });

    it('should publish the whole snapshot to HAPI when the import runs', async () => {
      await importAs(fixture.adminAuthorization).expect(202);
      await imports.whenIdle();

      expect(hapi.store.size).toBe(RESOURCE_COUNT);
    });

    it('should serve the imported ValueSet through the read API when the import has finished', async () => {
      await importAs(fixture.adminAuthorization).expect(202);
      await imports.whenIdle();

      const response = await api()
        .get(`/api/v1/terminology/expand?system=${encodeURIComponent(ICD10_VALUE_SET)}&filter=J06`)
        .set('authorization', bearer(doctor))
        .expect(200);

      expect(response.body.items.map((item: { code: string }) => item.code)).toContain('J06.9');
    });

    it('should audit the accepted and the finished import under the administrator when the import runs', async () => {
      const response = await importAs(fixture.adminAuthorization).expect(202);
      await imports.whenIdle();

      const events = importAudits();
      expect(events).toHaveLength(2);
      expect(events.map((event) => event['outcome'])).toEqual(['0', '0']);
      expect(events.every((event) => JSON.stringify(event).includes(response.body.importId))).toBe(true);
      expect(events.every((event) => JSON.stringify(event).includes(subOf(fixture.admin)))).toBe(true);
    });

    it('should audit a serious failure when HAPI refuses the snapshot', async () => {
      fixture.started.fakes.fhir.update.mockRejectedValue(new Error('HAPI down'));

      await importAs(fixture.adminAuthorization).expect(202);
      await imports.whenIdle();

      expect(importAudits().map((event) => event['outcome'])).toEqual(['0', '8']);
    });

    it('should answer 409 CONFLICT when an import is already running and accept again once it finished', async () => {
      const release = gate();
      const served = fixture.started.fakes.fhir.update.getMockImplementation();
      fixture.started.fakes.fhir.update.mockImplementationOnce(async (...args) => {
        await release.promise;
        return (served as NonNullable<typeof served>)(...args);
      });
      await importAs(fixture.adminAuthorization).expect(202);

      const conflict = await importAs(fixture.adminAuthorization).expect(409);
      release.open();
      await imports.whenIdle();

      expect(conflict.body).toMatchObject({ errorCode: 'CONFLICT' });
      expect(conflict.body.detail).toContain('IMPORT_RUNNING');
      await importAs(fixture.adminAuthorization).expect(202);
      await imports.whenIdle();
    });
  });
});
