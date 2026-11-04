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

  it('should throw when the private key is missing', () => {
    const withoutPrivateKey = {
      JWT_PUBLIC_KEY: SIGNING_ENV.JWT_PUBLIC_KEY,
      JWT_ISSUER: SIGNING_ENV.JWT_ISSUER,
    };

    expect(() => loadSigningKeys(withoutPrivateKey)).toThrow(
      /JWT_PRIVATE_KEY, JWT_PUBLIC_KEY and JWT_ISSUER/,
    );
  });

  it('should throw when the public key is missing', () => {
    const withoutPublicKey = {
      JWT_PRIVATE_KEY: SIGNING_ENV.JWT_PRIVATE_KEY,
      JWT_ISSUER: SIGNING_ENV.JWT_ISSUER,
    };

    expect(() => loadSigningKeys(withoutPublicKey)).toThrow();
  });

  it('should throw when the issuer is missing', () => {
    const withoutIssuer = {
      JWT_PRIVATE_KEY: SIGNING_ENV.JWT_PRIVATE_KEY,
      JWT_PUBLIC_KEY: SIGNING_ENV.JWT_PUBLIC_KEY,
    };

    expect(() => loadSigningKeys(withoutIssuer)).toThrow();
  });

  it('should read a literal backslash-n in the PEM as a line break', () => {
    const flattened = {
      ...SIGNING_ENV,
      JWT_PRIVATE_KEY: SIGNING_ENV.JWT_PRIVATE_KEY.trim().replace(/\n/g, '\\n'),
      JWT_PUBLIC_KEY: SIGNING_ENV.JWT_PUBLIC_KEY.trim().replace(/\n/g, '\\n'),
    };

    expect(loadSigningKeys(flattened).privateKeyPem).toContain('\n');
  });

  it('should throw a clear error when the private key is not a PEM', () => {
    expect(() => loadSigningKeys({ ...SIGNING_ENV, JWT_PRIVATE_KEY: 'not a key' })).toThrow(
      'JWT_PRIVATE_KEY is not a valid PEM private key',
    );
  });

  it('should throw a clear error when the public key is not a PEM', () => {
    expect(() => loadSigningKeys({ ...SIGNING_ENV, JWT_PUBLIC_KEY: 'not a key' })).toThrow(
      'JWT_PUBLIC_KEY is not a valid PEM public key',
    );
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
    // The token stores are in-process without REDIS_URL; a runner that sets it must not reach a real Redis.
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

  it('should bind TOKEN_REVOCATION to the issuer denylist so the guard layer can see revocations', async () => {
    const moduleRef = await withInfrastructureFakes(Test.createTestingModule({ imports: [OAuthModule] })).compile();

    try {
      const checker = moduleRef.get<TokenRevocationChecker>(TOKEN_REVOCATION);
      const tokens = moduleRef.get(TokenService);
      const issued = await tokens.issue({
        userId: 'u1',
        clientId: 'medcenter-web',
        scope: 'launch',
        kind: 'refresh',
        ttlSeconds: 60,
      });

      await expect(checker.isRevoked(issued.jti)).resolves.toBe(false);

      await tokens.revoke(issued.jti);

      await expect(checker.isRevoked(issued.jti)).resolves.toBe(true);
    } finally {
      await moduleRef.close();
    }
  });

  it('should resolve the guard-layer checker to the same revocation state as the token service', async () => {
    const moduleRef = await withInfrastructureFakes(Test.createTestingModule({ imports: [OAuthModule] })).compile();

    try {
      const checker = moduleRef.get<TokenRevocationChecker>(TOKEN_REVOCATION);
      const tokens = moduleRef.get(TokenService);
      const issued = await tokens.issue({
        userId: 'u1',
        clientId: 'medcenter-web',
        scope: 'launch',
        kind: 'refresh',
        ttlSeconds: 60,
      });

      // Rotation seals the refresh token against reuse and must not end the
      // session the client is still working in.
      await tokens.consume(issued.jti, 'refresh');

      await expect(checker.isRevoked(issued.jti)).resolves.toBe(false);
    } finally {
      await moduleRef.close();
    }
  });
});

describe('loadRegisteredClients', () => {
  it('should return an empty registry when OAUTH_CLIENTS_JSON is unset', () => {
    expect(loadRegisteredClients({})).toEqual([]);
  });

  it('should return an empty registry when OAUTH_CLIENTS_JSON is empty', () => {
    expect(loadRegisteredClients({ OAUTH_CLIENTS_JSON: '' })).toEqual([]);
  });

  it('should parse the client array when OAUTH_CLIENTS_JSON is valid', () => {
    const clients = loadRegisteredClients({
      OAUTH_CLIENTS_JSON: JSON.stringify([
        {
          clientId: 'medcenter-web',
          redirectUris: ['https://app.medcenter.by/api/auth/callback'],
          scopes: ['launch', 'patient/*.read'],
          isPublic: true,
        },
      ]),
    });

    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({ clientId: 'medcenter-web', isPublic: true });
  });

  it('should throw at boot when OAUTH_CLIENTS_JSON is not valid json', () => {
    expect(() => loadRegisteredClients({ OAUTH_CLIENTS_JSON: '{ not json' })).toThrow(
      /OAUTH_CLIENTS_JSON is not valid JSON/,
    );
  });

  it('should throw at boot when the payload is not an array', () => {
    expect(() =>
      loadRegisteredClients({ OAUTH_CLIENTS_JSON: '{"clientId":"medcenter-web"}' }),
    ).toThrow();
  });

  it('should throw at boot when the payload is a json null', () => {
    expect(() => loadRegisteredClients({ OAUTH_CLIENTS_JSON: 'null' })).toThrow();
  });

  it('should throw at boot when an entry is missing redirectUris', () => {
    // M3: this shape used to survive the cast and then throw a `TypeError`
    // on the public authorize route (`client.redirectUris[0]` → 500).
    expect(() =>
      loadRegisteredClients({
        OAUTH_CLIENTS_JSON: JSON.stringify([
          { clientId: 'broken', scopes: ['launch'], isPublic: true },
        ]),
      }),
    ).toThrow();
  });

  it.each([
    ['a relative path', '/api/auth/callback'],
    ['an address without a scheme', 'localhost:3000/api/auth/callback'],
    ['a javascript: URI', 'javascript:alert(1)'],
    ['a URI with a fragment', 'https://app.medcenter.by/callback#frag'],
    ['an empty fragment', 'https://app.medcenter.by/callback#'],
  ])('should throw at boot when a redirect URI is %s', (_label, redirectUri) => {
    expect(() =>
      loadRegisteredClients({
        OAUTH_CLIENTS_JSON: JSON.stringify([
          { clientId: 'broken', redirectUris: [redirectUri], scopes: ['launch'], isPublic: true },
        ]),
      }),
    ).toThrow(/absolute http\(s\) URL without a fragment/);
  });

  it('should accept an http redirect URI on localhost', () => {
    const clients = loadRegisteredClients({
      OAUTH_CLIENTS_JSON: JSON.stringify([
        { clientId: 'dev', redirectUris: ['http://localhost:3000/api/auth/callback'], scopes: ['launch'], isPublic: true },
      ]),
    });

    expect(clients).toHaveLength(1);
  });

  it('should throw at boot when an entry has an empty clientId', () => {
    expect(() =>
      loadRegisteredClients({
        OAUTH_CLIENTS_JSON: JSON.stringify([
          {
            clientId: '',
            redirectUris: ['https://app.medcenter.by/api/auth/callback'],
            scopes: ['launch'],
            isPublic: true,
          },
        ]),
      }),
    ).toThrow();
  });
});
