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

  it('should set the trust proxy hop count when an explicit setting is given', () => {
    // Arrange
    const { nest, server } = createApp();

    // Act
    applyHttpEdge(nest, 1);

    // Assert
    expect(server.get('trust proxy')).toBe(1);
  });

  it('should read TRUST_PROXY from the environment when no setting is given', () => {
    // Arrange
    process.env['TRUST_PROXY'] = '2';
    const { nest, server } = createApp();

    // Act
    applyHttpEdge(nest);

    // Assert
    expect(server.get('trust proxy')).toBe(2);
  });

  it('should trust no proxy when TRUST_PROXY is not set', () => {
    // Arrange
    delete process.env['TRUST_PROXY'];
    const { nest, server } = createApp();

    // Act
    applyHttpEdge(nest);

    // Assert
    expect(server.get('trust proxy')).toBe(false);
  });

  it('should throw at boot when TRUST_PROXY is not a valid value', () => {
    // Arrange
    process.env['TRUST_PROXY'] = 'not-a-proxy';
    const { nest } = createApp();

    // Act
    const configure = (): void => applyHttpEdge(nest);

    // Assert
    expect(configure).toThrow('TRUST_PROXY contains an invalid entry');
  });

  it('should drop the X-Powered-By header when the app answers a request', async () => {
    // Arrange
    const { nest, server } = createApp();
    applyHttpEdge(nest, 1);

    // Act
    const response = await request(server).get('/ip');

    // Assert
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('should key the client address on X-Forwarded-For when one proxy hop is trusted', async () => {
    // Arrange
    const { nest, server } = createApp();
    applyHttpEdge(nest, 1);

    // Act
    const response = await request(server).get('/ip').set('X-Forwarded-For', '203.0.113.7');

    // Assert
    expect(response.body).toEqual({ ip: '203.0.113.7' });
  });

  it('should ignore X-Forwarded-For when no proxy is trusted', async () => {
    // Arrange
    const { nest, server } = createApp();
    applyHttpEdge(nest, false);

    // Act
    const response = await request(server).get('/ip').set('X-Forwarded-For', '203.0.113.7');

    // Assert
    expect(response.body.ip).not.toBe('203.0.113.7');
  });
});
