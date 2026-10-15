import { Controller, Get, Req, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { applyHttpEdge } from './http-edge';

interface IpRequest {
  readonly ip: string;
}

/** Spec-only probe: echoes the address Express derived for the caller. */
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

/**
 * `applyHttpEdge` talks to the adapter through a structural type, so these cases
 * run it against a real Nest application on the Express adapter - the shape
 * every BFF `main.ts` hands it.
 */
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
    // Arrange
    app = await createNestApp((nest) => applyHttpEdge(nest, 1));

    // Act
    const response = await request(app.getHttpServer())
      .get('/probe/ip')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200);

    // Assert
    expect(response.body).toEqual({ ip: '203.0.113.7' });
  });

  it('should take the right-most untrusted address when a client forges a longer X-Forwarded-For chain', async () => {
    // Arrange — Traefik appends the real peer; the forged left entries must not become the client.
    app = await createNestApp((nest) => applyHttpEdge(nest, 1));

    // Act
    const response = await request(app.getHttpServer())
      .get('/probe/ip')
      .set('X-Forwarded-For', '198.51.100.1, 203.0.113.7')
      .expect(200);

    // Assert
    expect(response.body).toEqual({ ip: '203.0.113.7' });
  });

  it('should skip every trusted hop of a CIDR list when TRUST_PROXY names the proxy ranges', async () => {
    // Arrange — the string `parseTrustProxy` produces must be one Express understands.
    process.env['TRUST_PROXY'] = 'loopback, 10.0.0.0/8';
    app = await createNestApp((nest) => applyHttpEdge(nest));

    // Act
    const response = await request(app.getHttpServer())
      .get('/probe/ip')
      .set('X-Forwarded-For', '203.0.113.7, 10.1.2.3')
      .expect(200);

    // Assert
    expect(response.body).toEqual({ ip: '203.0.113.7' });
  });

  it('should key req.ip on the transport peer when TRUST_PROXY is not set', async () => {
    // Arrange
    delete process.env['TRUST_PROXY'];
    app = await createNestApp((nest) => applyHttpEdge(nest));

    // Act
    const response = await request(app.getHttpServer())
      .get('/probe/ip')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200);

    // Assert
    expect((response.body as IpRequest).ip).not.toBe('203.0.113.7');
  });

  it('should ignore X-Forwarded-For when no proxy is trusted', async () => {
    // Arrange
    app = await createNestApp((nest) => applyHttpEdge(nest, false));

    // Act
    const response = await request(app.getHttpServer())
      .get('/probe/ip')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200);

    // Assert
    expect((response.body as IpRequest).ip).not.toBe('203.0.113.7');
  });

  it('should not send the X-Powered-By banner when the Nest application answers', async () => {
    // Arrange
    app = await createNestApp((nest) => applyHttpEdge(nest, 1));

    // Act
    const response = await request(app.getHttpServer()).get('/probe/ip').expect(200);

    // Assert
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('should send the X-Powered-By banner when the edge was never applied', async () => {
    // Arrange — the control case: the assertion above is only meaningful if Express would send it.
    app = await createNestApp(() => undefined);

    // Act
    const response = await request(app.getHttpServer()).get('/probe/ip').expect(200);

    // Assert
    expect(response.headers['x-powered-by']).toBe('Express');
  });
});
