# auth-service

SMART on FHIR authorization server for the МедЦентр platform: OAuth2 + PKCE (S256), RS256 JWT with JWKS, and
the `auth` PostgreSQL schema (users, RBAC, the FHIR bridge and the OAuth store) managed with TypeORM migrations.

Architecture and edge routing: [`../../specs/architect-architecture.md`](../../specs/architect-architecture.md)
(ADR-009). Endpoints/DTOs: [`../../specs/api-designer-spec.md`](../../specs/api-designer-spec.md).
Build/test/tooling: [`../../specs/docs-generator-implementation.md`](../../specs/docs-generator-implementation.md).
This is the only BFF service implemented so far; the other seven are still planned (port map in
`../../infra/traefik/dynamic.yml`).

## Prerequisites

- Node.js 18+ and npm (install once at the workspace root: `npm install`).
- The local stack for integration work: `npm run stack:up` (PostgreSQL, Redis, RabbitMQ, HAPI FHIR, Traefik).

## Environment

Configuration is validated by `@medcenter/config` (`libs/config/src/lib/env.schema.ts`). Required keys:
`FHIR_BASE_URL`, `FHIR_CLIENT_ID`, `FHIR_CLIENT_SECRET`, `JWT_JWKS_URI`, `JWT_ISSUER`, `REDIS_URL`,
`RABBITMQ_URL`. Optional: `NODE_ENV`, `PORT` (default 3000), `RATE_LIMIT_PER_MINUTE` (default 120),
`TERMINOLOGY_UPSTREAM_URL`. Secrets have no defaults and are never committed.

## Commands (from the workspace root)

| Action | Command |
| --- | --- |
| Build | `npx nx build auth-service` |
| Serve (watch) | `npx nx serve auth-service` |
| Unit tests | `npx nx test auth-service` |
| E2E tests | `npx nx e2e auth-service` |
| Lint | `npx nx lint auth-service` |

## Layout

```
src/
├── main.ts                     # bootstrap
├── app/                        # AppModule + root controller
├── database/                   # auth DataSource factory + Init migration
└── modules/users/              # entities (user, role, user_role, external_link, oauth_client, oauth_token) + repositories
test/                           # jwt-perimeter.e2e-spec.ts
```

## Testing notes

`jest.config.ts` runs `src/**/*.spec.ts`; the `e2e` target uses `jest.e2e.config.ts` (`test/**/*.e2e-spec.ts`).
`user.repository.spec.ts` is a **database integration** test: it needs a reachable PostgreSQL (the compose stack,
`POSTGRES_PORT` default 5433) and hangs if none is available, so `nx test auth-service` does not complete
without the stack running. DB-free specs can be run on their own, e.g.
`npx jest -c apps/auth-service/jest.config.ts "src/database/"`.
