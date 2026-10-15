import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { DEDUP_STORE } from '../src/modules/notifications/deduplication.service';
import { applyE2eEnv } from './e2e-env';
import { bearer } from './e2e-tokens';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

const BASE = '/api/v1/notifications';

interface Route {
  readonly label: string;
  readonly verb: 'get' | 'post';
  readonly path: string;
  /** Scope the route demands, so the wrong-role case can carry it. */
  readonly scope: string;
}

const ROUTES: readonly Route[] = [
  { label: 'GET /notifications', verb: 'get', path: BASE, scope: 'patient/*.read' },
  { label: 'GET /notifications/unread-count', verb: 'get', path: `${BASE}/unread-count`, scope: 'patient/*.read' },
  { label: 'POST /notifications/{id}/read', verb: 'post', path: `${BASE}/c-1/read`, scope: 'patient/*.write' },
];

const TOKENS = {
  doctor: bearer({ role: 'DOCTOR', scope: 'user/*.read user/*.write launch', fhirUser: 'PractitionerRole/role-7' }),
  admin: bearer({ role: 'ADMIN', scope: 'user/*.read user/*.write launch' }),
  noPatientClaim: bearer({ role: 'PATIENT', scope: 'patient/*.read patient/*.write launch' }),
  readOnly: bearer({ role: 'PATIENT', scope: 'patient/*.read launch', patient: 'pat-1' }),
} as const;

/**
 * Who may read and change notifications (API §8, ADR-013): a patient token with
 * the right scope and a `patient` claim, nobody else. Every refusal must happen
 * before HAPI is called.
 */
describe('Notifications access control (e2e)', () => {
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;

  function call(route: Route, token?: string): request.Test {
    const agent = request(app.getHttpServer())[route.verb](route.path);
    return token === undefined ? agent : agent.set('Authorization', token);
  }

  function expectFhirUntouched(): void {
    for (const interaction of [fhir.search, fhir.read, fhir.update]) {
      expect(interaction).not.toHaveBeenCalled();
    }
  }

  beforeEach(async () => {
    applyE2eEnv();
    fhir = { search: jest.fn(), read: jest.fn(), update: jest.fn() } as unknown as jest.Mocked<FhirClient>;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FHIR_CLIENT)
      .useValue(fhir)
      .overrideProvider(DEDUP_STORE)
      .useValue({ claim: jest.fn(), complete: jest.fn(), delete: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  describe.each(ROUTES)('$label', (route) => {
    it('should answer 401 UNAUTHENTICATED when the call carries no token', async () => {
      // Act
      const response = await call(route).expect(401);

      // Assert
      expect(response.body).toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
      expectFhirUntouched();
    });

    it.each([
      ['doctor', TOKENS.doctor],
      ['admin', TOKENS.admin],
    ])('should answer 403 FORBIDDEN_SCOPE when a %s token carries only user scopes', async (_role, token) => {
      // Act
      const response = await call(route, token).expect(403);

      // Assert
      expect(response.body).toMatchObject({ status: 403, errorCode: 'FORBIDDEN_SCOPE' });
      expectFhirUntouched();
    });

    it('should answer 403 FORBIDDEN_ROLE when a staff token carries the patient scope', async () => {
      // Arrange
      const staffWithPatientScope = bearer({ role: 'DOCTOR', scope: `${route.scope} launch`, fhirUser: 'PractitionerRole/role-7' });

      // Act
      const response = await call(route, staffWithPatientScope).expect(403);

      // Assert
      expect(response.body).toMatchObject({ status: 403, errorCode: 'FORBIDDEN_ROLE' });
      expectFhirUntouched();
    });

    it('should answer 403 COMPARTMENT_VIOLATION when a patient token carries no patient claim', async () => {
      // Act
      const response = await call(route, TOKENS.noPatientClaim).expect(403);

      // Assert
      expect(response.body).toMatchObject({ status: 403, errorCode: 'COMPARTMENT_VIOLATION' });
      expectFhirUntouched();
    });
  });

  it('should answer 403 FORBIDDEN_SCOPE when a patient token holds only the read scope and marks a notification read', async () => {
    // Act
    const response = await call(ROUTES[2] as Route, TOKENS.readOnly).expect(403);

    // Assert
    expect(response.body).toMatchObject({ status: 403, errorCode: 'FORBIDDEN_SCOPE' });
    expectFhirUntouched();
  });
});
