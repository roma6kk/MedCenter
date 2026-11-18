import type { INestApplication } from '@nestjs/common';
import express, { type Express } from 'express';
import request from 'supertest';

import { applyHttpEdge } from './http-edge';

function createApp(): { readonly nest: INestApplication; readonly server: Express } {
  const server = express();
  server.get('/ip', (req, res) => {
    res.json({ ip: req.ip });
  });
  const nest = { getHttpAdapter: () => ({ getInstance: () => server }) } as unknown as INestApplication;
  return { nest, server };
}

describe('applyHttpEdge', () => {
  const originalTrustProxy = process.env['TRUST_PROXY'];

  afterEach(() => {
    if (originalTrustProxy === undefined) {
      delete process.env['TRUST_PROXY'];
    } else {
      process.env['TRUST_PROXY'] = originalTrustProxy;
    }
  });

  it('should mark every response no-store so patient data is not kept in a shared browser cache', async () => {
    const { nest, server } = createApp();
    applyHttpEdge(nest, false);
    server.get('/late', (_req, res) => {
      res.json({ ok: true });
    });

    const response = await request(server).get('/late');

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['pragma']).toBe('no-cache');
  });

  it('should set the trust proxy hop count when an explicit setting is given', () => {
    const { nest, server } = createApp();

    applyHttpEdge(nest, 1);

    expect(server.get('trust proxy')).toBe(1);
  });

  it('should read TRUST_PROXY from the environment when no setting is given', () => {
    process.env['TRUST_PROXY'] = '2';
    const { nest, server } = createApp();

    applyHttpEdge(nest);

    expect(server.get('trust proxy')).toBe(2);
  });

  it('should trust no proxy when TRUST_PROXY is not set', () => {
    delete process.env['TRUST_PROXY'];
    const { nest, server } = createApp();

    applyHttpEdge(nest);

    expect(server.get('trust proxy')).toBe(false);
  });

  it('should throw at boot when TRUST_PROXY is not a valid value', () => {
    process.env['TRUST_PROXY'] = 'not-a-proxy';
    const { nest } = createApp();

    const configure = (): void => applyHttpEdge(nest);

    expect(configure).toThrow('TRUST_PROXY contains an invalid entry');
  });

  it('should drop the X-Powered-By header when the app answers a request', async () => {
    const { nest, server } = createApp();
    applyHttpEdge(nest, 1);

    const response = await request(server).get('/ip');

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('should key the client address on X-Forwarded-For when one proxy hop is trusted', async () => {
    const { nest, server } = createApp();
    applyHttpEdge(nest, 1);

    const response = await request(server).get('/ip').set('X-Forwarded-For', '203.0.113.7');

    expect(response.body).toEqual({ ip: '203.0.113.7' });
  });

  it('should ignore X-Forwarded-For when no proxy is trusted', async () => {
    const { nest, server } = createApp();
    applyHttpEdge(nest, false);

    const response = await request(server).get('/ip').set('X-Forwarded-For', '203.0.113.7');

    expect(response.body.ip).not.toBe('203.0.113.7');
  });
});
