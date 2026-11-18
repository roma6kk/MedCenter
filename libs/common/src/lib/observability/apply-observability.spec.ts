import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { applyObservability } from './apply-observability';

@Controller('things')
class ThingController {
  @Get(':id')
  one(): { ok: true } {
    return { ok: true };
  }
}

describe('applyObservability', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  async function start(env: NodeJS.ProcessEnv): Promise<void> {
    const moduleRef = await Test.createTestingModule({ controllers: [ThingController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    applyObservability(app, { service: 'svc', dependencies: ['redis'] }, { ...env, LOG_LEVEL: 'error' });
    await app.init();
  }

  it('should expose RED metrics by route template, not by raw path', async () => {
    await start({});
    await request(app.getHttpServer()).get('/things/123').expect(200);
    await request(app.getHttpServer()).get('/nope/456').expect(404);

    const text = (await request(app.getHttpServer()).get('/metrics').expect(200)).text;

    expect(text).toContain('route="/things/:id"');
    expect(text).toContain('route="unmatched"');
    expect(text).not.toContain('123');
  });

  it('should answer /ready 200 without dependencies configured and 503 naming the failed one', async () => {
    await start({});
    await request(app.getHttpServer()).get('/ready').expect(200, { status: 'ok', service: 'svc' });
    await app.close();

    await start({ REDIS_URL: 'redis://127.0.0.1:1' });
    const response = await request(app.getHttpServer()).get('/ready').expect(503);

    expect(response.body).toEqual({ status: 'unavailable', service: 'svc', failed: ['redis'] });
  });
});
