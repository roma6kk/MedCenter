# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Nx workspace for the backend (`apps/*`, `libs/*`) with path aliases `@medcenter/{contracts,common,config}`.
- `apps/auth-service` — SMART/OAuth2 authorization server: TypeORM entities for the `auth` schema
  (user, role, user_role, external_link, oauth_client, oauth_token), an Init migration, and a
  runtime/test `DataSource` factory (migrations run explicitly; `synchronize` is always off).
- `libs/common` — shared guard stack (`JwtAuth`, `Scope`, `Role`, `RateLimit`), the RFC 7807
  `ProblemDetails` filter, guard metadata decorators, request context and `RequestIdMiddleware`.
- `libs/config` — zod environment schema with per-process caching and narrow guard/JWT/rate-limit views.
- `libs/contracts` — `ErrorCode` catalogue + HTTP status map, `PaginatedResponseDto`, `ProblemDetails`,
  `Role`, `SMART_SCOPES` and versioned domain-event contracts.
- Local Docker Compose stack (PostgreSQL, Redis, RabbitMQ, HAPI FHIR, Traefik) and a Traefik file provider
  that terminates TLS and adds security headers only (no token validation at the edge, ADR-009).
- Versioned terminology seed under `tools/terminology-seed` preserving `https://fhir.by/...` canonicals
  (ADR-002/ADR-016).
- Unit suites for the new shared libs and for the auth data-source/migration factories — 14 suites / 71 tests
  green across `contracts`, `common` and `config`.

### Changed

- `specs/MANIFEST.md` now records the backend implementation status and the tooling spec.

### Fixed

- `POST /oauth/token/revoke` now enforces RFC 7009 §2.1 ownership: a refresh token is revoked only when it was
  issued to the authenticated principal (`userId` matches the Bearer `sub`, and `client_id` matches its owner
  when supplied). Unknown, already-unusable or non-owned tokens are a no-op (`{ revoked: false }`).
- `POST /oauth/token` (API 2.1.3) now reports a revoked or rotated refresh token as **400 `invalid_grant`**,
  keeping the endpoint strictly RFC 6749 §5.2 as the API spec documents; `TOKEN_REVOKED` (401) is reserved for
  the guard layer (follow-up work).
- `user.repository.spec.ts` skips itself when PostgreSQL is unreachable, so `nx test auth-service` passes without
  a live compose stack. Alongside it: `Role.description` gained an explicit `varchar` column type, the `auth`
  schema is created before `runMigrations`, and `user` rows are truncated with `CASCADE`.
