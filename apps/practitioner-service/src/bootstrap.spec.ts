import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setRateLimitStore } from '@medcenter/common';
import Redis from 'ioredis';

import { configureApp, createApp } from './bootstrap';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ on: jest.fn(), eval: jest.fn().mockResolvedValue(1) })),
}));

jest.mock('./app/app.module', () => ({ AppModule: class AppModule {} }));

jest.mock('@nestjs/core', () => ({
  ...jest.requireActual<typeof import('@nestjs/core')>('@nestjs/core'),
  NestFactory: { create: jest.fn() },
}));

const ENV: NodeJS.ProcessEnv = {
  JWT_JWKS_URI: 'http://auth-service:3001/.well-known/jwks.json',
  JWT_ISSUER: 'https://api.medcenter.by',
  REDIS_URL: 'redis://:secret@redis:6379',
  TRUST_PROXY: '1',
};

interface FakeApp {
  readonly app: INestApplication;
  readonly set: jest.Mock;
  readonly disable: jest.Mock;
  readonly useGlobalPipes: jest.Mock;
}

function createFakeApp(): FakeApp {
  const set = jest.fn();
  const disable = jest.fn();
  const useGlobalPipes = jest.fn();
  const app = { getHttpAdapter: () => ({ getInstance: () => ({ set, disable }) }), useGlobalPipes } as unknown as INestApplication;
  return { app, set, disable, useGlobalPipes };
}

describe('configureApp', () => {
  it('should set trust proxy, hide X-Powered-By and mount the validation pipe when the app is configured', () => {
    // Arrange
    const { app, set, disable, useGlobalPipes } = createFakeApp();

    // Act
    configureApp(app, 1);

    // Assert
    expect(set).toHaveBeenCalledWith('trust proxy', 1);
    expect(disable).toHaveBeenCalledWith('x-powered-by');
    expect(useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
  });
});

/** The wiring `main.ts` relies on: if one of these calls drops out of `createApp`, the service ships without it. */
describe('createApp', () => {
  beforeEach(() => {
    jest.mocked(Redis).mockClear();
    jest.mocked(NestFactory.create).mockReset();
  });

  afterEach(() => {
    setRateLimitStore(null);
  });

  it('should install the rate-limit store, trust proxy and validation pipe when the environment is complete', async () => {
    // Arrange
    const { app, set, disable, useGlobalPipes } = createFakeApp();
    jest.mocked(NestFactory.create).mockResolvedValue(app as never);

    // Act
    const created = await createApp(ENV, new Logger('test'));

    // Assert — a Redis client for the limiter, then the proxy hop count and the pipe on the created app.
    expect(created).toBe(app);
    expect(Redis).toHaveBeenCalledWith(ENV['REDIS_URL'], expect.any(Object));
    expect(set).toHaveBeenCalledWith('trust proxy', 1);
    expect(disable).toHaveBeenCalledWith('x-powered-by');
    expect(useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
  });

  it('should fail before the app is created when TRUST_PROXY is not valid', async () => {
    // Act
    const boot = createApp({ ...ENV, TRUST_PROXY: 'not-a-proxy' }, new Logger('test'));

    // Assert
    await expect(boot).rejects.toThrow();
    expect(NestFactory.create).not.toHaveBeenCalled();
  });

  it('should fail before the app is created when REDIS_URL is missing', async () => {
    // Act
    const boot = createApp({ ...ENV, REDIS_URL: undefined }, new Logger('test'));

    // Assert — the rate limit has no store without Redis, so the service must not start.
    await expect(boot).rejects.toThrow();
    expect(NestFactory.create).not.toHaveBeenCalled();
  });
});
