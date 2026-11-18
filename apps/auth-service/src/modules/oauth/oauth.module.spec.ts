import { Test } from '@nestjs/testing';
import { TOKEN_REVOCATION, type TokenRevocationChecker } from '@medcenter/common';

import { withInfrastructureFakes } from '../../__tests__/infrastructure-fakes';
import { createTestKeys } from './__tests__/test-keys';
import { OAuthModule, loadRegisteredClients, loadSigningKeys } from './oauth.module';
import { TokenService } from './token.service';

const KEYS = createTestKeys();
const SIGNING_ENV = {
  JWT_PRIVATE_KEY: KEYS.privateKeyPem,
  JWT_PUBLIC_KEY: KEYS.publicKeyPem,
  JWT_ISSUER: 'https://api.medcenter.by',
};

describe('loadSigningKeys', () => {
  it('should return the key material when the private key, public key and issuer are set', () => {
    expect(loadSigningKeys({ ...SIGNING_ENV })).toEqual({
      privateKeyPem: SIGNING_ENV.JWT_PRIVATE_KEY,
      publicKeyPem: SIGNING_ENV.JWT_PUBLIC_KEY,
      issuer: SIGNING_ENV.JWT_ISSUER,
      kid: 'auth-1',
    });
  });

  it('should default the key id to auth-1 when JWT_KEY_ID is unset', () => {
    expect(loadSigningKeys({ ...SIGNING_ENV }).kid).toBe('auth-1');
  });

  it('should honour an explicit JWT_KEY_ID', () => {
    expect(loadSigningKeys({ ...SIGNING_ENV, JWT_KEY_ID: 'auth-2026-10' }).kid).toBe('auth-2026-10');
  });

  it.each([
    ['private key', 'JWT_PRIVATE_KEY'],
    ['public key', 'JWT_PUBLIC_KEY'],
    ['issuer', 'JWT_ISSUER'],
  ])('should throw when the %s is missing', (_label, variable) => {
    const without = Object.fromEntries(Object.entries(SIGNING_ENV).filter(([key]) => key !== variable));

    expect(() => loadSigningKeys(without)).toThrow(/JWT_PRIVATE_KEY, JWT_PUBLIC_KEY and JWT_ISSUER/);
  });

  it('should read a literal backslash-n in the PEM as a line break', () => {
    const flattened = {
      ...SIGNING_ENV,
      JWT_PRIVATE_KEY: SIGNING_ENV.JWT_PRIVATE_KEY.trim().replace(/\n/g, '\\n'),
      JWT_PUBLIC_KEY: SIGNING_ENV.JWT_PUBLIC_KEY.trim().replace(/\n/g, '\\n'),
    };

    expect(loadSigningKeys(flattened).privateKeyPem).toContain('\n');
  });

  it.each([
    ['private', 'JWT_PRIVATE_KEY'],
    ['public', 'JWT_PUBLIC_KEY'],
  ])('should throw a clear error when the %s key is not a PEM', (kind, variable) => {
    expect(() => loadSigningKeys({ ...SIGNING_ENV, [variable]: 'not a key' })).toThrow(`${variable} is not a valid PEM ${kind} key`);
  });

  it('should throw when the public key belongs to another private key', () => {
    expect(() => loadSigningKeys({ ...SIGNING_ENV, JWT_PUBLIC_KEY: createTestKeys().publicKeyPem })).toThrow(
      'JWT_PUBLIC_KEY does not match JWT_PRIVATE_KEY',
    );
  });

  it('should throw when the environment is empty', () => {
    expect(() => loadSigningKeys({})).toThrow();
  });
});

describe('OAuthModule wiring', () => {
  const ENV_KEYS = ['JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY', 'JWT_ISSUER', 'REDIS_URL'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
    }
    process.env['JWT_PRIVATE_KEY'] = SIGNING_ENV.JWT_PRIVATE_KEY;
    process.env['JWT_PUBLIC_KEY'] = SIGNING_ENV.JWT_PUBLIC_KEY;
    process.env['JWT_ISSUER'] = SIGNING_ENV.JWT_ISSUER;
    delete process.env['REDIS_URL'];
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      const previous = saved[key];
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });

  async function withWiredTokens(
    run: (checker: TokenRevocationChecker, tokens: TokenService, jti: string) => Promise<void>,
  ): Promise<void> {
    const moduleRef = await withInfrastructureFakes(Test.createTestingModule({ imports: [OAuthModule] })).compile();

    try {
      const tokens = moduleRef.get(TokenService);
      const issued = await tokens.issue({ userId: 'u1', clientId: 'medcenter-web', scope: 'launch', kind: 'refresh', ttlSeconds: 60 });

      await run(moduleRef.get<TokenRevocationChecker>(TOKEN_REVOCATION), tokens, issued.jti);
    } finally {
      await moduleRef.close();
    }
  }

  it('should bind TOKEN_REVOCATION to the issuer denylist so the guard layer can see revocations', () =>
    withWiredTokens(async (checker, tokens, jti) => {
      await expect(checker.isRevoked(jti)).resolves.toBe(false);

      await tokens.revoke(jti);

      await expect(checker.isRevoked(jti)).resolves.toBe(true);
    }));

  it('should resolve the guard-layer checker to the same revocation state as the token service', () =>
    withWiredTokens(async (checker, tokens, jti) => {
      await tokens.consume(jti, 'refresh');

      await expect(checker.isRevoked(jti)).resolves.toBe(false);
    }));
});

describe('loadRegisteredClients', () => {
  const clientsEnv = (overrides: Record<string, unknown>): { OAUTH_CLIENTS_JSON: string } => ({
    OAUTH_CLIENTS_JSON: JSON.stringify([
      { clientId: 'medcenter-web', redirectUris: ['https://app.medcenter.by/api/auth/callback'], scopes: ['launch', 'patient/*.read'], isPublic: true, ...overrides },
    ]),
  });

  it('should return an empty registry when OAUTH_CLIENTS_JSON is unset', () => {
    expect(loadRegisteredClients({})).toEqual([]);
  });

  it('should return an empty registry when OAUTH_CLIENTS_JSON is empty', () => {
    expect(loadRegisteredClients({ OAUTH_CLIENTS_JSON: '' })).toEqual([]);
  });

  it('should parse the client array when OAUTH_CLIENTS_JSON is valid', () => {
    const clients = loadRegisteredClients(clientsEnv({}));

    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({ clientId: 'medcenter-web', isPublic: true });
  });

  it('should throw at boot when OAUTH_CLIENTS_JSON is not valid json', () => {
    expect(() => loadRegisteredClients({ OAUTH_CLIENTS_JSON: '{ not json' })).toThrow(
      /OAUTH_CLIENTS_JSON is not valid JSON/,
    );
  });

  it.each([
    ['the payload is not an array', '{"clientId":"medcenter-web"}'],
    ['the payload is a json null', 'null'],
  ])('should throw at boot when %s', (_label, json) => {
    expect(() => loadRegisteredClients({ OAUTH_CLIENTS_JSON: json })).toThrow();
  });

  it('should throw at boot when an entry is missing redirectUris', () => {
    expect(() => loadRegisteredClients(clientsEnv({ redirectUris: undefined }))).toThrow();
  });

  it.each([
    ['a relative path', '/api/auth/callback'],
    ['an address without a scheme', 'localhost:3000/api/auth/callback'],
    ['a javascript: URI', 'javascript:alert(1)'],
    ['a URI with a fragment', 'https://app.medcenter.by/callback#frag'],
    ['an empty fragment', 'https://app.medcenter.by/callback#'],
  ])('should throw at boot when a redirect URI is %s', (_label, redirectUri) => {
    expect(() => loadRegisteredClients(clientsEnv({ clientId: 'broken', redirectUris: [redirectUri] }))).toThrow(
      /absolute http\(s\) URL without a fragment/,
    );
  });

  it('should accept an http redirect URI on localhost', () => {
    const clients = loadRegisteredClients(
      clientsEnv({ clientId: 'dev', redirectUris: ['http://localhost:3000/api/auth/callback'], scopes: ['launch'] }),
    );

    expect(clients).toHaveLength(1);
  });

  it('should throw at boot when an entry has an empty clientId', () => {
    expect(() => loadRegisteredClients(clientsEnv({ clientId: '', scopes: ['launch'] }))).toThrow();
  });
});
