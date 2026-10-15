import type { INestApplication } from '@nestjs/common';

import { parseTrustProxy, type TrustProxySetting } from './trust-proxy';

/** The two Express settings the edge needs; a structural type keeps `express` types out of the app code. */
interface ExpressSettings {
  set(name: string, value: unknown): unknown;
  disable(name: string): unknown;
}

/**
 * Edge hygiene every BFF applies right after `NestFactory.create`:
 *
 * - `trust proxy` — behind Traefik `request.ip` is the proxy unless Express is
 *   told to read `X-Forwarded-For`. Without it every anonymous caller (public
 *   routes have no `sub`) shares the proxy's rate-limit bucket, so one busy
 *   client answers 429 to everybody. The value comes from `TRUST_PROXY`
 *   (see {@link parseTrustProxy}); pass an already parsed setting to validate
 *   the variable earlier in the boot.
 * - `x-powered-by` — the framework banner is not advertised to clients.
 *
 * Throws on an invalid `TRUST_PROXY`, so a misconfigured deployment fails at boot.
 */
export function applyHttpEdge(
  app: INestApplication,
  trustProxy: TrustProxySetting = parseTrustProxy(process.env['TRUST_PROXY']),
): void {
  const express = app.getHttpAdapter().getInstance() as ExpressSettings;
  express.set('trust proxy', trustProxy);
  express.disable('x-powered-by');
}
