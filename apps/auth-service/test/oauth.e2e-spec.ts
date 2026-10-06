import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe, type RequestWithClaims } from '@medcenter/common';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { TokenService } from '../src/modules/oauth/token.service';
import {
  E2E_CLIENT_ID,
  E2E_CONFIDENTIAL_CLIENT_ID,
  E2E_CONFIDENTIAL_SECRET,
  E2E_FHIR_BASE,
  E2E_ISSUER,
  E2E_KEY_ID,
  E2E_REDIRECT_URI,
  applyE2eEnv,
} from './e2e-env';

// `jose` ships pure ESM and Jest's CJS runtime cannot load it at all, so the
// signature check is stubbed for this suite. The *claims* are still decoded from
// the token the application actually signed, which is what the revocation chain
// under test depends on; RS256 signing is covered by `jwt.service.spec.ts` and the
// unauthenticated perimeter by `jwt-perimeter.e2e-spec.ts`.
jest.mock('jose', () => ({
  createRemoteJWKSet: () => 'mocked-jwks',
  jwtVerify: async (token: string) => {
    const segment = token.split('.')[1] ?? '';
    const payload: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return { payload, protectedHeader: { alg: 'RS256' } };
  },
}));

const PKCE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

/** RFC 7636 appendix B verifier; its S256 challenge is `PKCE_CHALLENGE`. */
const PKCE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

/**
 * Spec-only probe controller: it never ships with the application, it exists to
 * prove that the globally mounted guard stack (ADR-009) refuses a Bearer token
 * the issuer has since revoked.
 */
@Controller()
class RevocationProbeController {
  @Get('internal/revocation-probe')
  probe(@Req() request: RequestWithClaims): { readonly sub: string | undefined } {
    return { sub: request.user?.sub };
  }
}

function authorizeQuery(extra: Record<string, string> = {}): string {
  return new URLSearchParams(extra).toString();
}

describe('OAuth / SMART surface (API 2.1.1–2.1.5)', () => {
  let app: INestApplication;
  let tokens: TokenService;

  beforeAll(async () => {
    applyE2eEnv();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RevocationProbeController],
    }).compile();
    tokens = moduleRef.get(TokenService);
    app = moduleRef.createNestApplication();
    // The same factory `main.ts` mounts, so this suite validates through the
    // pipeline that ships rather than through an unvalidated handler.
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /.well-known/smart-configuration', () => {
    it('should publish the SMART endpoints when called without a token', async () => {
      const response = await request(app.getHttpServer())
        .get('/.well-known/smart-configuration')
        .expect(200);

      expect(response.body).toMatchObject({
        authorization_endpoint: `${E2E_ISSUER}/oauth/authorize`,
        token_endpoint: `${E2E_ISSUER}/oauth/token`,
        revocation_endpoint: `${E2E_ISSUER}/oauth/token/revoke`,
        jwks_uri: `${E2E_ISSUER}/.well-known/jwks.json`,
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
        fhir_base: E2E_FHIR_BASE,
      });
    });

    it('should advertise the SMART scope catalogue', async () => {
      const response = await request(app.getHttpServer())
        .get('/.well-known/smart-configuration')
        .expect(200);

      expect(response.body.scopes_supported).toEqual(
        expect.arrayContaining(['launch', 'patient/*.read', 'user/*.read']),
      );
    });
  });

  describe('GET /.well-known/jwks.json', () => {
    it('should publish exactly one RS256 signing key without private material', async () => {
      const response = await request(app.getHttpServer()).get('/.well-known/jwks.json').expect(200);

      expect(response.body.keys).toHaveLength(1);
      expect(response.body.keys[0]).toMatchObject({
        kty: 'RSA',
        alg: 'RS256',
        use: 'sig',
        kid: E2E_KEY_ID,
      });
      expect(response.body.keys[0]).not.toHaveProperty('d');
    });
  });

  describe('GET /oauth/authorize', () => {
    it('should answer the RFC 6749 envelope with invalid_client when client_id is absent', async () => {
      const response = await request(app.getHttpServer())
        .get(`/oauth/authorize?${authorizeQuery({ code_challenge_method: 'S256', code_challenge: PKCE_CHALLENGE })}`)
        .expect(401);

      // Not problem+json: SMART clients branch on `error` (RFC 6749 §5.2).
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toMatchObject({
        error: 'invalid_client',
        errorCode: 'UNAUTHENTICATED',
      });
      expect(response.headers['location']).toBeUndefined();
    });

    it('should answer 401 when the client_id is unknown', async () => {
      await request(app.getHttpServer())
        .get(`/oauth/authorize?${authorizeQuery({ client_id: 'rogue-app' })}`)
        .expect(401);
    });

    it('should reject the request when code_challenge_method is not S256', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/oauth/authorize?${authorizeQuery({
            client_id: E2E_CLIENT_ID,
            redirect_uri: E2E_REDIRECT_URI,
            code_challenge_method: 'plain',
            code_challenge: PKCE_CHALLENGE,
          })}`,
        )
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'invalid_request',
        error_description: 'code_challenge_method must be S256',
      });
    });

    it('should reject the request when code_challenge is missing', async () => {
      await request(app.getHttpServer())
        .get(
          `/oauth/authorize?${authorizeQuery({
            client_id: E2E_CLIENT_ID,
            redirect_uri: E2E_REDIRECT_URI,
            code_challenge_method: 'S256',
          })}`,
        )
        .expect(400);
    });

    it('should refuse an unregistered redirect_uri without redirecting anywhere', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/oauth/authorize?${authorizeQuery({
            client_id: E2E_CLIENT_ID,
            redirect_uri: 'https://attacker.example/callback',
            code_challenge_method: 'S256',
            code_challenge: PKCE_CHALLENGE,
          })}`,
        )
        .redirects(0)
        .expect(400);

      expect(response.headers['location']).toBeUndefined();
    });

    it('should bounce an authenticated-looking request to the registered redirect_uri with access_denied', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/oauth/authorize?${authorizeQuery({
            client_id: E2E_CLIENT_ID,
            redirect_uri: E2E_REDIRECT_URI,
            state: 'state-1',
            scope: 'patient/*.read',
            code_challenge_method: 'S256',
            code_challenge: PKCE_CHALLENGE,
          })}`,
        )
        .redirects(0)
        .expect(302);

      const target = new URL(String(response.headers['location']));
      expect(target.origin + target.pathname).toBe(E2E_REDIRECT_URI);
      expect(target.searchParams.get('error')).toBe('access_denied');
      expect(target.searchParams.get('state')).toBe('state-1');
    });

    it('should not issue an authorization code because the route never carries a principal', async () => {
      // Assumption UI-1: the credential form is rendered inside this route. Until it
      // exists nothing populates `request.user` — the route is `@Public()`, so the
      // global JwtAuthGuard returns early and never attaches claims. The
      // authorization_code grant is therefore unreachable over HTTP end to end.
      const response = await request(app.getHttpServer())
        .get(
          `/oauth/authorize?${authorizeQuery({
            client_id: E2E_CLIENT_ID,
            redirect_uri: E2E_REDIRECT_URI,
            code_challenge_method: 'S256',
            code_challenge: PKCE_CHALLENGE,
          })}`,
        )
        .set('authorization', 'Bearer not.a.real.token')
        .redirects(0)
        .expect(302);

      const target = new URL(String(response.headers['location']));
      expect(target.searchParams.get('code')).toBeNull();
      expect(target.searchParams.get('error')).toBe('access_denied');
    });
  });

  describe('POST /oauth/token', () => {
    it('should answer 400 for an unsupported grant_type', async () => {
      await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'client_credentials', client_id: E2E_CLIENT_ID })
        .expect(400);
    });

    it('should answer 400 when the authorization_code grant omits code_verifier', async () => {
      await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'authorization_code', code: 'c', client_id: E2E_CLIENT_ID })
        .expect(400);
    });

    it('should answer 400 for an unknown authorization code', async () => {
      await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code: 'unknown-code',
          client_id: E2E_CLIENT_ID,
          code_verifier: 'x'.repeat(43),
        })
        .expect(400);
    });

    it('should answer 400 for an unknown refresh_token', async () => {
      await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: 'nope', client_id: E2E_CLIENT_ID })
        .expect(400);
    });

    it('should reject a token exchange that omits the grant_type', async () => {
      await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({ client_id: E2E_CLIENT_ID })
        .expect(400);
    });

    it('should answer unsupported_grant_type in the RFC 6749 envelope', async () => {
      const response = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'client_credentials', client_id: E2E_CLIENT_ID })
        .expect(400);

      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toMatchObject({
        error: 'unsupported_grant_type',
        errorCode: 'VALIDATION_ERROR',
      });
    });

    it('should answer invalid_grant in the RFC 6749 envelope for an unknown code', async () => {
      const response = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code: 'unknown-code',
          client_id: E2E_CLIENT_ID,
          code_verifier: 'x'.repeat(43),
        })
        .expect(400);

      expect(response.body).toMatchObject({ error: 'invalid_grant' });
    });

    it('should answer 401 invalid_client when the client_id is not registered', async () => {
      const response = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'client_credentials', client_id: 'rogue-app' })
        .expect(401);

      expect(response.body).toMatchObject({ error: 'invalid_client' });
    });

    it('should answer 401 invalid_client when client_id is omitted', async () => {
      const response = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'client_credentials' })
        .expect(401);

      expect(response.body).toMatchObject({ error: 'invalid_client' });
    });

    it('should answer 401 invalid_client when a confidential client omits its secret', async () => {
      const response = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'client_credentials', client_id: E2E_CONFIDENTIAL_CLIENT_ID })
        .expect(401);

      expect(response.body).toMatchObject({ error: 'invalid_client' });
    });

    it('should answer 401 invalid_client when a confidential client presents a wrong secret', async () => {
      await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'client_credentials',
          client_id: E2E_CONFIDENTIAL_CLIENT_ID,
          client_secret: 'guessed',
        })
        .expect(401);
    });

    it('should let an authenticated confidential client reach the grant handler', async () => {
      const response = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'refresh_token',
          refresh_token: 'unknown',
          client_id: E2E_CONFIDENTIAL_CLIENT_ID,
          client_secret: E2E_CONFIDENTIAL_SECRET,
        })
        .expect(400);

      expect(response.body).toMatchObject({ error: 'invalid_grant' });
    });
  });

  describe('POST /oauth/token/revoke', () => {
    it('should answer 401 problem+json when no bearer token is presented', async () => {
      const response = await request(app.getHttpServer())
        .post('/oauth/token/revoke')
        .send({ refreshToken: 'some-refresh-token' })
        .expect(401);

      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    // Ownership (RFC 7009 §2.1) is asserted at the service and controller layers
    // (`oauth.service.spec.ts`, `oauth.controller.spec.ts`) for principals other
    // than the owner. Minting a pair directly from `TokenService` is what makes
    // the *owner's* path reachable over HTTP (see the revocation suite below),
    // because the authorization_code grant itself is gated behind Assumption UI-1
    // (the login form is not yet rendered inside `GET /oauth/authorize`).
  });

  describe('guard-layer revocation (TOKEN_REVOKED)', () => {
    interface TokenPair {
      readonly accessToken: string;
      readonly refreshToken: string;
    }

    async function mintPair(userId: string): Promise<TokenPair> {
      const code = await tokens.issue({
        userId,
        clientId: E2E_CONFIDENTIAL_CLIENT_ID,
        scope: 'user/*.read',
        kind: 'code',
        ttlSeconds: 300,
        codeChallenge: PKCE_CHALLENGE,
      });

      const response = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code: code.jti,
          client_id: E2E_CONFIDENTIAL_CLIENT_ID,
          client_secret: E2E_CONFIDENTIAL_SECRET,
          code_verifier: PKCE_VERIFIER,
        })
        .expect(200);

      return {
        accessToken: response.body.access_token as string,
        refreshToken: response.body.refresh_token as string,
      };
    }

    it('should accept the freshly minted access token at the perimeter', async () => {
      const { accessToken } = await mintPair('user-accept');

      await request(app.getHttpServer())
        .get('/internal/revocation-probe')
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should refuse the still-live access token with 401 TOKEN_REVOKED once its refresh token is revoked', async () => {
      const { accessToken, refreshToken } = await mintPair('user-revoke');

      await request(app.getHttpServer())
        .get('/internal/revocation-probe')
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);

      const revoked = await request(app.getHttpServer())
        .post('/oauth/token/revoke')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      expect(revoked.body).toEqual({ revoked: true });

      // Same Bearer token, 15-minute lifetime still largely ahead of it: the
      // revocation, not the expiry, is what has to end it.
      const response = await request(app.getHttpServer())
        .get('/internal/revocation-probe')
        .set('authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 401, errorCode: 'TOKEN_REVOKED' });
    });

    it('should keep the access token valid when the refresh token is merely rotated', async () => {
      const { accessToken, refreshToken } = await mintPair('user-rotate');

      const rotated = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: E2E_CONFIDENTIAL_CLIENT_ID,
          client_secret: E2E_CONFIDENTIAL_SECRET,
        })
        .expect(200);

      expect(rotated.body.refresh_token).not.toBe(refreshToken);

      // Reuse detection seals the rotated refresh token, but the session is still
      // live: rotation must not log its own caller out.
      await request(app.getHttpServer())
        .get('/internal/revocation-probe')
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should answer invalid_grant for a replayed refresh token after rotation', async () => {
      const { refreshToken } = await mintPair('user-replay');

      await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: E2E_CONFIDENTIAL_CLIENT_ID,
          client_secret: E2E_CONFIDENTIAL_SECRET,
        })
        .expect(200);

      const replay = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: E2E_CONFIDENTIAL_CLIENT_ID,
          client_secret: E2E_CONFIDENTIAL_SECRET,
        })
        .expect(400);

      // RFC 6749 §5.2 / API 2.1.3: a revoked or rotated refresh token is
      // indistinguishable from an unknown one on this endpoint.
      expect(replay.body).toMatchObject({ error: 'invalid_grant' });
    });
  });

  describe('global validation pipeline (M1)', () => {
    it('should reject a form field that arrives with the wrong type', async () => {
      // Only the mounted global `ValidationPipe` can produce this: without it the
      // repeated `code_verifier` reaches the handler and is answered as
      // `invalid_grant` by PKCE instead of as a validation failure.
      const response = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send(
          'grant_type=authorization_code&code=c&client_id=' +
            `${E2E_CLIENT_ID}&code_verifier=a&code_verifier=b`,
        )
        .expect(400);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 400, errorCode: 'VALIDATION_ERROR' });
    });

    it('should keep answering invalid_request in the RFC 6749 envelope for an empty form value', async () => {
      const response = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code: 'c',
          client_id: E2E_CLIENT_ID,
          code_verifier: '',
        })
        .expect(400);

      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toMatchObject({ error: 'invalid_request' });
    });

    it('should reject a body property no DTO declares without breaking client authentication', async () => {
      // `client_secret` is read from the raw body by `TokenClientGuard`, which
      // runs before pipes: whitelisting it out of the DTO must not 400 the call.
      const response = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'refresh_token',
          refresh_token: 'unknown',
          client_id: E2E_CONFIDENTIAL_CLIENT_ID,
          client_secret: E2E_CONFIDENTIAL_SECRET,
        })
        .expect(400);

      expect(response.body).toMatchObject({ error: 'invalid_grant' });
    });
  });
});
