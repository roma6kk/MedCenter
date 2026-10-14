import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Browser calls go to relative `/api/v1/*` (same-origin); the Next server
// proxies them to the Traefik edge. Server-side `publicApiFetch` uses the same
// base via NEXT_PUBLIC_API_URL.
// - `next dev` on the host: defaults to the plain-HTTP dev entrypoint :8081.
// - Container image (infra/docker/web.Dockerfile): built with
//   NEXT_PUBLIC_API_URL=http://traefik:8081. Both the rewrite and the inlined
//   NEXT_PUBLIC_* value are fixed at BUILD time, so a change needs a rebuild.
const projectRoot = dirname(fileURLToPath(import.meta.url));
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8081';

const isDev = process.env.NODE_ENV !== 'production';

// The web client is published on its own port, outside Traefik's
// `security-headers` middleware, so it must send its own. Next.js inlines its
// bootstrap scripts, hence 'unsafe-inline' for scripts and styles (a nonce
// would need per-request middleware); React Refresh needs 'unsafe-eval' in dev
// only. Browser calls stay same-origin (`/api/v1` rewrite), the OAuth hand-off
// is a top-level navigation, so `connect-src` can stay at 'self'. `form-action`
// is left out on purpose: the login form's redirect chain ends on the auth origin.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `.next/standalone/server.js` + traced deps — what the container ships.
  output: 'standalone',
  // Pin the file-tracing root to frontend/: without it Next infers the repository root
  // (a lockfile exists there too) and nests the standalone server under `frontend/`.
  outputFileTracingRoot: projectRoot,
  reactStrictMode: true,
  // No `X-Powered-By: Next.js` fingerprint.
  poweredByHeader: false,
  experimental: { optimizePackageImports: ['lucide-react'] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiBase}/api/v1/:path*` }];
  },
};

export default nextConfig;
