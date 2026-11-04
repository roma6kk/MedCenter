import { JsonLogger } from './json-logger';
import { runWithRequestId } from './request-scope';

function capture(options: ConstructorParameters<typeof JsonLogger>[1] = {}): {
  readonly logger: JsonLogger;
  readonly lines: Record<string, unknown>[];
} {
  const lines: Record<string, unknown>[] = [];
  const logger = new JsonLogger(
    'svc',
    { now: () => new Date('2026-01-01T00:00:00Z'), write: (line) => lines.push(JSON.parse(line)), ...options },
    {},
  );
  return { logger, lines };
}

describe('JsonLogger', () => {
  it('should write the pino-style call as fields plus message', () => {
    const { logger, lines } = capture();

    logger.log({ fetched: 3, stored: 2 }, 'audit journal synchronised');

    expect(lines[0]).toMatchObject({
      time: '2026-01-01T00:00:00.000Z',
      level: 'info',
      service: 'svc',
      msg: 'audit journal synchronised',
      fetched: 3,
      stored: 2,
    });
  });

  it('should treat the last string of a Nest-style call as the context', () => {
    const { logger, lines } = capture();

    logger.warn('Mapped route', 'RouterExplorer');

    expect(lines[0]).toMatchObject({ level: 'warn', context: 'RouterExplorer', msg: 'Mapped route' });
  });

  it('should keep the stack of a Nest-style error call', () => {
    const { logger, lines } = capture();

    logger.error('boom', 'Error: boom\n at x', 'Ctx');

    expect(lines[0]).toMatchObject({ level: 'error', msg: 'boom', context: 'Ctx', stack: 'Error: boom\n at x' });
  });

  it('should flatten an error object into name, message and stack', () => {
    const { logger, lines } = capture();

    logger.error({ err: new TypeError('bad'), requestId: 'r1' }, 'Unhandled exception');

    expect(lines[0]['err']).toMatchObject({ name: 'TypeError', message: 'bad' });
    expect(lines[0]['msg']).toBe('Unhandled exception');
  });

  it('should stamp the request id of the running request', () => {
    const { logger, lines } = capture();

    runWithRequestId('req-1', () => logger.log('inside'));
    logger.log('outside');

    expect(lines[0]['requestId']).toBe('req-1');
    expect(lines[1]).not.toHaveProperty('requestId');
  });

  it('should never serialise authorization headers, tokens or passwords', () => {
    const { logger, lines } = capture();

    logger.warn({ headers: { authorization: 'Bearer abc', accept: 'x' }, password: 'p', refresh_token: 't' }, 'm');

    const text = JSON.stringify(lines[0]);
    expect(text).not.toContain('Bearer abc');
    expect(lines[0]['password']).toBe('[redacted]');
    expect(lines[0]['refresh_token']).toBe('[redacted]');
    expect((lines[0]['headers'] as Record<string, unknown>)['accept']).toBe('x');
  });

  it('should drop lines below the level and survive a circular object', () => {
    const { logger, lines } = capture({ level: 'warn' });
    const loop: Record<string, unknown> = {};
    loop['self'] = loop;

    logger.log('quiet');
    logger.warn({ loop }, 'loud');

    expect(lines).toHaveLength(1);
    expect(lines[0]['msg']).toBe('loud');
  });
});
