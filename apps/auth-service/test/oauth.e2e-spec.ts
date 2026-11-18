import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import type { RequestWithClaims } from '@medcenter/common';
import { Role } from '@medcenter/contracts';
import request from 'supertest';

import { StubIdentityResolver } from '../src/modules/oauth/__tests__/identity-stub';
import { TokenService } from '../src/modules/oauth/token.service';
import { startAuthApp } from './app-harness';
import {
  E2E_CLIENT_ID,
  E2E_CONFIDENTIAL_CLIENT_ID,
  E2E_CONFIDENTIAL_SECRET,
  E2E_FHIR_BASE,
  E2E_ISSUER,
  E2E_KEY_ID,
  E2E_REDIRECT_URI,
} from './e2e-env';

jest.mock('jose', () => ({
  createRemoteJWKSet: () => 'mocked-jwks',
  jwtVerify: async (token: string) => {
    const segment = token.split('.')[1] ?? '';
    const payload: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return { payload, protectedHeader: { alg: 'RS256' } };
  },
}));

const PKCE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

const PKCE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

@Controller()
class RevocationProbeController {
  @Get('internal/revocation-probe')
  probe(@Req() request: RequestWithClaims): { readonly sub: string | undefined } {
    return { sub: request.user?.sub };
  }
}

function authorizeQuery(extra: Record<string, string> = {}): string {
  return new URLSearchParams({ response_type: 'code', ...extra }).toString();
}

describe('OAuth / SMART surface (API 2.1.1–2.1.5)', () => {
  let app: INestApplication;
  let tokens: TokenService;

  beforeAll(async () => {
    const started = await startAuthApp({
      controllers: [RevocationProbeController],
      identities: new StubIdentityResolver(Role.DOCTOR),
    });
    app = started.app;
    tokens = started.moduleRef.get(TokenService);
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
        .get(
          `/oauth/authorize?${authorizeQuery({ code_challenge_method: 'S256', code_challenge: PKCE_CHALLENGE })}`,
        )
        .expect(401);

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

    it('should reject response_type=token', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/oauth/authorize?${authorizeQuery({
            client_id: E2E_CLIENT_ID,
            redirect_uri: E2E_REDIRECT_URI,
            response_type: 'token',
            code_challenge_method: 'S256',
            code_challenge: PKCE_CHALLENGE,
          })}`,
        )
        .redirects(0)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'invalid_request',
        error_description: 'response_type must be code',
      });
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

    it('should render the login form instead of bouncing when the browser has no login session', async () => {
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
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      expect(response.text).toContain('action="/oauth/login"');
      expect(response.headers['location']).toBeUndefined();
    });

    it('should not issue an authorization code when only a Bearer token is presented', async () => {
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
        .expect(200);

      expect(response.headers['location']).toBeUndefined();
      expect(response.text).toContain('<form');
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

      expect(replay.body).toMatchObject({ error: 'invalid_grant' });
    });
  });

  describe('global validation pipeline (M1)', () => {
    it('should reject a form field that arrives with the wrong type', async () => {
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

    it('should carry Cache-Control no-store on the successful token response', async () => {
      const code = await tokens.issue({
        userId: 'user-cache',
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

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['pragma']).toBe('no-cache');
      expect(response.body.access_token).toBeTruthy();
    });

    it('should reject a body property no DTO declares without breaking client authentication', async () => {
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
