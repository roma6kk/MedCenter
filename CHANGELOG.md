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

### Changed

- `EncounterCompleteForm` now submits the full atomic `CompleteEncounterDto` (МКБ-10 diagnoses ≥ 1,
  `ServiceRequest`/`MedicationRequest`, UCUM select-only unit), so an encounter can actually be completed.

### Fixed

- Middleware moved to `src/middleware.ts` — route-group guards now execute (the file previously sat in
  `src/app/` and was dead code).
- JSX in a `.ts` file (`SectionTitle`) and the missing Jest transform.
- Auth callback fails closed on a malformed `mc_pkce` cookie (`?error=access_denied` instead of a 500) and sets
  the `secure` cookie flag conditionally, so login works on `http://localhost`.
- `apiFetch` attaches `Authorization: Bearer` from the broker-hydrated session; `TOKEN_REVOKED` clears the token.

