# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Frontend (`frontend/`) — standalone Next.js 15 App Router client (5 route groups, 27 routes): public catalog,
  SMART sign-in, patient cabinet (booking, appointments, history, prescriptions, profile, notifications),
  doctor cabinet (journal, schedule, encounter, patient), admin section (analytics, users, services, rooms,
  schedules, terminology, audit).
- Token-broker route handlers `/api/auth/{authorize,callback,refresh,session,logout}` — PKCE S256, httpOnly
  `mc_rt` refresh cookie, single-flight silent refresh.
- Component and unit test suites — 19 suites / 212 tests (Jest + Testing Library via `next/jest`).
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
- Containerised `auth-service`: multi-stage `Dockerfile` (node:22-alpine + tini), `.dockerignore`, and a
  `docker-compose` service with a Postgres/Redis healthcheck and an `/oauth/authorize` readiness probe.
- **M2 — Catalog (read side):** `libs/terminology` (canonical `fhir.by` URLs + ICD-10/ATC/UCUM validators),
  `libs/fhir` (`FHIR_CLIENT` token + dependency-free FHIR HTTP client) and `libs/fhir-mappers`
  (slot/appointment/practitioner mappers).
- `apps/practitioner-service` — doctor catalog (FR-002/016) and room CRUD with a `409 ROOM_IN_USE` guard
  when an active `Schedule` references the `Location` (FR-017).
- `apps/catalog-service` — services catalog with НСИ terminology validation (FR-003), schedules with
  idempotent R4 `Slot` generation over a 90-day horizon and `409 SCHEDULE_OVERLAP` enforcement (FR-020),
  and a read-through `RedisCacheService` (NFR-005).
- Unit + e2e suites for the M2 libraries and services (typecheck, lint, test and build green across all
  9 Nx projects; `jwt-perimeter` e2e present in both new services, ADR-009).
- Bruno collection `bruno/medcenter-api/` — requests for every endpoint of the API spec (§2-§9), the RFC 7807
  error catalogue and the booking → encounter chain, with a token helper script.
- Playwright E2E suites for scenarios A-F (guest booking, slot conflict, cancel, encounter, admin schedule,
  notifications, reports and audit filters) and the security checks (patient compartment, role guards, `returnTo`),
  with a `setup` project signing in once per demo account (`E2E_BROWSER_CHANNEL=chrome` drives an installed Chrome).
- Audit: `AuditEvent` for catalog, room and schedule creates, updates and deletes, written in the same transaction
  (ADR-020: logical `what` reference + client-assigned UUID ids).
- Draw.io diagrams `docs/diagrams/` (container view, booking → encounter sequence with the `If-Match` points).
- Swagger / OpenAPI for all eight BFF services: `setupSwagger` in `libs/common` serves the UI at `/api/docs/<service>`
  (plus `-json` and `-yaml`) through per-service Traefik routers `docs-<service>`; off unless `SWAGGER_ENABLED=true`
  (default `false`, passed via compose `x-bff-env`). Every endpoint and DTO is documented, errors reference the global
  RFC 7807 `problemDetails` schema (`ApiProblems`), auth is Bearer-only, and each service has a `swagger.spec.ts`
  that checks its document against the API spec (API §10).

### Changed

- `EncounterCompleteForm` now submits the full atomic `CompleteEncounterDto` (МКБ-10 diagnoses ≥ 1,
  `ServiceRequest`/`MedicationRequest`, UCUM select-only unit), so an encounter can actually be completed.
- `specs/MANIFEST.md` now records the backend implementation status and the tooling spec.
- ADR-012 now describes the implemented optimistic locking (`If-Match` on the booking, encounter and
  no-show/cancel transactions); `specs/api-designer-spec.md` was aligned with the code (11 differences found
  by the Bruno collection); `README.md` documents running, seeding, testing, E2E and Bruno.
- Test-only libraries moved from `dependencies` to `devDependencies`, so they no longer reach runtime images.
- Encounter opening extracted into `EncounterOpeningService`.

### Fixed

- Middleware moved to `src/middleware.ts` — route-group guards now execute (the file previously sat in
  `src/app/` and was dead code).
- JSX in a `.ts` file (`SectionTitle`) and the missing Jest transform.
- Auth callback fails closed on a malformed `mc_pkce` cookie (`?error=access_denied` instead of a 500) and sets
  the `secure` cookie flag conditionally, so login works on `http://localhost`.
- `apiFetch` attaches `Authorization: Bearer` from the broker-hydrated session; `TOKEN_REVOKED` clears the token.
- `POST /oauth/token/revoke` now enforces RFC 7009 §2.1 ownership: a refresh token is revoked only when it was
  issued to the authenticated principal (`userId` matches the Bearer `sub`, and `client_id` matches its owner
  when supplied). Unknown, already-unusable or non-owned tokens are a no-op (`{ revoked: false }`).
- `POST /oauth/token` (API 2.1.3) now reports a revoked or rotated refresh token as **400 `invalid_grant`**,
  keeping the endpoint strictly RFC 6749 §5.2 as the API spec documents; `TOKEN_REVOKED` (401) is reserved for
  the guard layer (follow-up work).
- `user.repository.spec.ts` skips itself when PostgreSQL is unreachable, so `nx test auth-service` passes without
  a live compose stack. Alongside it: `Role.description` gained an explicit `varchar` column type, the `auth`
  schema is created before `runMigrations`, and `user` rows are truncated with `CASCADE`.
- Opening an encounter now also writes the Appointment (`meta.tag` `encounter-opened`) under `If-Match`, so a
  concurrent no-show or cancel loses the race (`ENCOUNTER_STATE_INVALID` / `APPOINTMENT_NOT_CANCELLABLE`).
- Two parallel `POST /encounters` no longer write a second opening `AuditEvent`: only the winning open does.
- Room identifier uniqueness is atomic (conditional PUT); blank identifiers are trimmed and rejected.
- analytics-service retries the first audit sync with a backoff while HAPI boots.
- Terminology seed retries `$expand` on a 5xx with a bounded backoff.
- The doctor journal no longer links cancelled and no-show rows to the patient card.
- `GET /api/v1/doctors` filtered by service or specialty now pages and counts doctors, not roles: `totalItems`
  was the number of matching `PractitionerRole`s and a doctor with two roles shortened the page.
