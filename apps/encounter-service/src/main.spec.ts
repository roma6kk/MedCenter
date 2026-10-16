const mockCreate = jest.fn();
const mockRedis = jest.fn();
const mockSetRateLimitStore = jest.fn();

jest.mock('@nestjs/core', () => ({
  ...jest.requireActual<typeof import('@nestjs/core')>('@nestjs/core'),
  NestFactory: { create: (...args: unknown[]): unknown => mockCreate(...args) },
}));

jest.mock('@medcenter/common', () => ({
  ...jest.requireActual<typeof import('@medcenter/common')>('@medcenter/common'),
  setRateLimitStore: (...args: unknown[]): unknown => mockSetRateLimitStore(...args),
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: function Redis(...args: unknown[]): unknown {
    return mockRedis(...args);
  },
}));

jest.mock('./app/app.module', () => ({ AppModule: class AppModule {} }));

const ENV: Readonly<Record<string, string>> = {
  JWT_JWKS_URI: 'http://auth-service:3001/.well-known/jwks.json',
  JWT_ISSUER: 'https://api.medcenter.by',
  REDIS_URL: 'redis://:secret@redis:6379',
};
const MANAGED_KEYS = [...Object.keys(ENV), 'TRUST_PROXY', 'PORT'] as const;

interface FakeApp {
  readonly app: unknown;
  readonly calls: string[];
  readonly set: jest.Mock;
  readonly disable: jest.Mock;
  readonly useGlobalPipes: jest.Mock;
  readonly listen: jest.Mock;
}

/** An app that records the order of the calls `main.ts` makes on it. */
function createFakeApp(): FakeApp {
  const calls: string[] = [];
  const record = (name: string) => jest.fn(() => calls.push(name));
  const set = record('set');
  const disable = record('disable');
  const useGlobalPipes = record('useGlobalPipes');
  const listen = jest.fn(async () => calls.push('listen'));
  const app = {
    getHttpAdapter: () => ({ getInstance: () => ({ set, disable }) }),
    useGlobalPipes,
    enableShutdownHooks: record('enableShutdownHooks'),
    listen,
  };
  return { app, calls, set, disable, useGlobalPipes, listen };
}

/**
 * Runs `main.ts` the way `node` does: importing it starts the bootstrap, which
 * this waits out. Each run gets its own module registry, so the logger is
 * silenced inside it.
 */
async function runMain(): Promise<void> {
  await jest.isolateModulesAsync(async () => {
    const { Logger } = await import('@nestjs/common');
    Logger.overrideLogger(false);
    await import('./main');
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('encounter-service main', () => {
  let exit: jest.SpyInstance;
  let fake: FakeApp;

  beforeEach(() => {
    for (const key of MANAGED_KEYS) {
      delete process.env[key];
    }
    Object.assign(process.env, ENV);
    fake = createFakeApp();
    mockCreate.mockReset().mockResolvedValue(fake.app);
    mockRedis.mockReset().mockReturnValue({ on: jest.fn() });
    mockSetRateLimitStore.mockReset();
    exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of MANAGED_KEYS) {
      delete process.env[key];
    }
  });

  it('should trust the Traefik hop and hide X-Powered-By before the app listens when TRUST_PROXY is 1', async () => {
    // Arrange
    process.env['TRUST_PROXY'] = '1';

    // Act
    await runMain();

    // Assert
    expect(fake.set).toHaveBeenCalledWith('trust proxy', 1);
    expect(fake.disable).toHaveBeenCalledWith('x-powered-by');
    expect(fake.calls.indexOf('set')).toBeLessThan(fake.calls.indexOf('listen'));
    expect(fake.calls.indexOf('disable')).toBeLessThan(fake.calls.indexOf('listen'));
  });

  it('should trust no proxy when TRUST_PROXY is not set', async () => {
    // Act
    await runMain();

    // Assert
    expect(fake.set).toHaveBeenCalledWith('trust proxy', false);
    expect(fake.listen).toHaveBeenCalledTimes(1);
  });

  it('should exit with code 1 and never listen when TRUST_PROXY is not a valid value', async () => {
    // Arrange
    process.env['TRUST_PROXY'] = 'not-a-proxy';

    // Act
    await runMain();

    // Assert
    expect(exit).toHaveBeenCalledWith(1);
    expect(fake.listen).not.toHaveBeenCalled();
  });

  it('should mount the validation pipe and install the Redis-backed rate-limit store when the environment is complete', async () => {
    // Act
    await runMain();

    // Assert
    expect(fake.useGlobalPipes.mock.calls[0]?.[0]?.constructor.name).toBe('ValidationPipe');
    expect(mockRedis).toHaveBeenCalledWith(ENV['REDIS_URL'], { maxRetriesPerRequest: 1 });
    expect(mockSetRateLimitStore).toHaveBeenCalledTimes(1);
  });

  it('should listen on the route-map port 3007 when PORT is not set', async () => {
    // Act
    await runMain();

    // Assert
    expect(fake.listen).toHaveBeenCalledWith(3007);
  });

  it('should listen on the PORT variable when it is set', async () => {
    // Arrange
    process.env['PORT'] = '8080';

    // Act
    await runMain();

    // Assert
    expect(fake.listen).toHaveBeenCalledWith('8080');
  });

  it('should exit with code 1 before the app is created when REDIS_URL is missing', async () => {
    // Arrange
    delete process.env['REDIS_URL'];

    // Act
    await runMain();

    // Assert
    expect(exit).toHaveBeenCalledWith(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// Module scope: keeps these test-local declarations out of the global script scope (root tsc).
export {};
