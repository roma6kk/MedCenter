import { Controller, Get, Req, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { applyHttpEdge } from './http-edge';

interface IpRequest {
  readonly ip: string;
}

@Controller('probe')
class ClientIpController {
  @Get('ip')
  clientIp(@Req() req: IpRequest): { readonly ip: string } {
    return { ip: req.ip };
  }
}

async function createNestApp(configure: (app: INestApplication) => void): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ controllers: [ClientIpController] }).compile();
  const app = moduleRef.createNestApplication();
  configure(app);
  await app.init();
  return app;
}

describe('applyHttpEdge on a Nest application', () => {
  const originalTrustProxy = process.env['TRUST_PROXY'];
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (originalTrustProxy === undefined) {
      delete process.env['TRUST_PROXY'];
    } else {
      process.env['TRUST_PROXY'] = originalTrustProxy;
    }
  });

  it('should key req.ip on X-Forwarded-For when one Traefik hop is trusted', async () => {
    app = await createNestApp((nest) => applyHttpEdge(nest, 1));

    const response = await request(app.getHttpServer())
      .get('/probe/ip')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200);

    expect(response.body).toEqual({ ip: '203.0.113.7' });
  });

  it('should take the right-most untrusted address when a client forges a longer X-Forwarded-For chain', async () => {
    app = await createNestApp((nest) => applyHttpEdge(nest, 1));

    const response = await request(app.getHttpServer())
      .get('/probe/ip')
      .set('X-Forwarded-For', '198.51.100.1, 203.0.113.7')
      .expect(200);

    expect(response.body).toEqual({ ip: '203.0.113.7' });
  });

  it('should skip every trusted hop of a CIDR list when TRUST_PROXY names the proxy ranges', async () => {
    process.env['TRUST_PROXY'] = 'loopback, 10.0.0.0/8';
    app = await createNestApp((nest) => applyHttpEdge(nest));

    const response = await request(app.getHttpServer())
      .get('/probe/ip')
      .set('X-Forwarded-For', '203.0.113.7, 10.1.2.3')
      .expect(200);

    expect(response.body).toEqual({ ip: '203.0.113.7' });
  });

  it('should key req.ip on the transport peer when TRUST_PROXY is not set', async () => {
    delete process.env['TRUST_PROXY'];
    app = await createNestApp((nest) => applyHttpEdge(nest));

    const response = await request(app.getHttpServer())
      .get('/probe/ip')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200);

    expect((response.body as IpRequest).ip).not.toBe('203.0.113.7');
  });

  it('should ignore X-Forwarded-For when no proxy is trusted', async () => {
    app = await createNestApp((nest) => applyHttpEdge(nest, false));

    const response = await request(app.getHttpServer())
      .get('/probe/ip')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200);

    expect((response.body as IpRequest).ip).not.toBe('203.0.113.7');
  });

  it('should not send the X-Powered-By banner when the Nest application answers', async () => {
    app = await createNestApp((nest) => applyHttpEdge(nest, 1));

    const response = await request(app.getHttpServer()).get('/probe/ip').expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('should send the X-Powered-By banner when the edge was never applied', async () => {
    app = await createNestApp(() => undefined);

    const response = await request(app.getHttpServer()).get('/probe/ip').expect(200);

    expect(response.headers['x-powered-by']).toBe('Express');
  });
});
