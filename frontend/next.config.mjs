import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Browser calls use same-origin `/api/v1/*`; Next proxies them to Traefik. NEXT_PUBLIC_API_URL is fixed at build time.
const projectRoot = dirname(fileURLToPath(import.meta.url));
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8081';

const isDev = process.env.NODE_ENV !== 'production';

// The web port is outside Traefik's security-headers middleware, so it sends its own CSP.
// `form-action` is left out on purpose: the login redirect chain ends on the auth origin.
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
  output: 'standalone',
  // Pin the tracing root to frontend/: otherwise Next picks the repo root and nests the standalone server.
  outputFileTracingRoot: projectRoot,
  reactStrictMode: true,
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
