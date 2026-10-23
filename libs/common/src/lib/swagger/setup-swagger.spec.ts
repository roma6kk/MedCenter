import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ApiProblems } from './api-problem.decorator';
import { collectModuleControllers, findUndocumentedOperations } from './openapi-audit';
import { buildOpenApiDocument, setupSwagger } from './setup-swagger';

@ApiTags('demo')
@Controller('api/v1/demo')
class DemoController {
  @Get()
  @ApiOperation({ summary: 'List demo' })
  @ApiResponse({ status: 200, description: 'ok' })
  @ApiProblems([404, 409])
  list(): string[] {
    return [];
  }

  @Get('bare')
  bare(): string {
    return '';
  }
}

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ controllers: [DemoController] }).compile();
  return moduleRef.createNestApplication();
}

describe('Swagger setup (API §10)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should add the global problemDetails schema with the errorCode catalogue and a Bearer scheme', () => {
    const document = buildOpenApiDocument(app, { service: 'demo', enabled: true });

    const schema = document.components?.schemas?.['problemDetails'] as { properties: Record<string, { enum?: string[] }> };
    expect(schema.properties['errorCode']?.enum).toEqual(expect.arrayContaining(['SLOT_CONFLICT', 'VALIDATION_ERROR', 'INTERNAL']));
    expect(document.components?.securitySchemes?.['bearer']).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  it('should reference problemDetails as application/problem+json from @ApiProblems and list the error codes', () => {
    const document = buildOpenApiDocument(app, { service: 'demo', enabled: true });

    const responses = document.paths['/api/v1/demo']?.get?.responses as Record<string, { description: string; content: Record<string, unknown> }>;
    expect(responses['409']?.content['application/problem+json']).toEqual({ schema: { $ref: '#/components/schemas/problemDetails' } });
    expect(responses['409']?.description).toContain('SLOT_CONFLICT');
  });

  it('should report operations that lack tag, summary or a success response', () => {
    const document = buildOpenApiDocument(app, { service: 'demo', enabled: true });

    const problems = findUndocumentedOperations(document);

    expect(problems).toEqual(expect.arrayContaining(['GET /api/v1/demo/bare: no @ApiOperation summary']));
    expect(problems.filter((problem) => problem.startsWith('GET /api/v1/demo:'))).toEqual([]);
  });

  it('should not serve /api/docs/<service> while disabled', async () => {
    expect(setupSwagger(app, { service: 'demo', enabled: false })).toBe(false);
    await app.init();
    await request(app.getHttpServer()).get('/api/docs/demo-json').expect(404);
  });

  it('should serve the UI and the JSON once enabled', async () => {
    expect(setupSwagger(app, { service: 'demo', enabled: true })).toBe(true);
    await app.init();
    const json = await request(app.getHttpServer()).get('/api/docs/demo-json').expect(200);
    expect((json.body as { info: { title: string } }).info.title).toBe('MedCenter demo-service API');
    await request(app.getHttpServer()).get('/api/docs/demo').expect(200);
  });

  it('should collect controllers through nested and dynamic module imports', () => {
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    class Inner {}
    Reflect.defineMetadata('controllers', [DemoController], Inner);
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    class Root {}
    Reflect.defineMetadata('imports', [{ module: Inner }], Root);

    expect(collectModuleControllers(Root)).toEqual([DemoController]);
  });
});
