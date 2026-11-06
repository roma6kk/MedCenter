import type { INestApplication } from '@nestjs/common';

import { parseTrustProxy, type TrustProxySetting } from './trust-proxy';

interface ExpressSettings {
  use(handler: typeof noStore): unknown;
  set(name: string, value: unknown): unknown;
  disable(name: string): unknown;
}

/** Responses carry personal data: none may land in a shared browser's cache. */
function noStore(_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
  next();
}

/** `trust proxy` is required behind Traefik, otherwise every anonymous caller shares the proxy's rate-limit bucket. Throws on an invalid `TRUST_PROXY`. */
export function applyHttpEdge(
  app: INestApplication,
  trustProxy: TrustProxySetting = parseTrustProxy(process.env['TRUST_PROXY']),
): void {
  const express = app.getHttpAdapter().getInstance() as ExpressSettings;
  express.set('trust proxy', trustProxy);
  express.disable('x-powered-by');
  express.use(noStore);
}
