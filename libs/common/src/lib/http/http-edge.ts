import type { INestApplication } from '@nestjs/common';

import { parseTrustProxy, type TrustProxySetting } from './trust-proxy';

/** The two Express settings the edge needs; a structural type keeps `express` types out of the app code. */
interface ExpressSettings {
  use(handler: typeof noStore): unknown;
  set(name: string, value: unknown): unknown;
  disable(name: string): unknown;
}

/**
 * Every API answer carries clinical or personal data (or is a refusal about
 * it), so no response may land in a shared browser's HTTP cache: the next
 * person at the workstation would read it after sign-out.
 */
function noStore(_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
  next();
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
 * - `Cache-Control: no-store` — on every response, see {@link noStore}; a route
 *   that is safe to cache may overwrite it in its controller.
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
  express.use(noStore);
}
