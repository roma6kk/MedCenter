# tz-matrix progress (attempt 1)

Status: done

Examined:
- Requirements doc (FR-001..021, BR-001..009, NFR-001..011, KDR/A-assumptions), api-designer-spec (all sections, 70 endpoint rows), architect ADR-014/018/019/020/021, route maps (backend + frontend API calls), TASK-005 open questions (avoided duplicates: doctor patient search, UTC analytics dates, password reset).
- Spec vs code: all 70 spec'd endpoint rows exist in controllers; none missing. (Spec header says "59 endpoints" — outdated count, noted in the matrix only.)
- Frontend routes (frontend/src/app) vs ТЗ functions of the three roles; admin/doctor nav (staff-shell, layout.* messages).
- FR-008: events booked / cancelled / encounter.completed / patient.registered only; noshow has none; admin-cancel text; en text; no e-mail channel.
- FR-014: Procedure is modelled as ServiceRequest (ordering) — correct, no finding.
- FR-015: users lifecycle create/edit/deactivate/reactivate present in API + UI; doctor profile (Practitioner/PractitionerRole) is seed-only.
- FR-018: only terminology; no runtime settings anywhere.
- FR-021: audit coverage table in the matrix; gaps = slot generation, 7.2 admin read.
- NFR-007: only liveness /health; no /ready, no /metrics, no structured logger (pino absent, 77 pino-style calls).
- NFR-008: ru/en catalogue parity 1514/1514; gaps = server login page, notification texts.
- BR-001..009 spot-checked in code; BR-002 admin path unreachable from UI.
- Cross-checked sibling unit be-auth-oauth: tz-matrix-03 duplicates be-auth-oauth-03 (marked); NFR-009 cross-referenced to be-auth-oauth-01/02.

Findings written (12): tz-matrix-01 (7.2 admin reads clinical content, security/high), 02 (no noshow notification, gap/high), 03 (login page ru-only, i18n/medium, DUP of be-auth-oauth-03), 04 (notification texts ru-only, i18n/medium), 05 (admin-cancel text, gap/low), 06 (no /ready + /metrics, gap/medium), 07 (no structured logs, gap/medium), 08 (FR-018 settings, gap/high, needsDecision), 09 (BR-002 admin appointments UI, gap/medium, needsDecision), 10 (FR-015 doctor onboarding, gap/medium, needsDecision), 11 (slot generation not audited, gap/medium), 12 (e-mail channel KDR-7/A-3, question/low, needsDecision).
Matrix file: tasks/TASK-006/findings/tz-matrix/verify-tz-matrix.md (Russian, tables: spec-vs-code, ТЗ functions, FR, FR-008 breakdown, FR-021 coverage, BR, NFR, findings summary).

Remaining:
- Nothing required. Not verified (needs running stack): NFR-003 CapabilityStatement, NFR-005 performance, Docker/compose runtime behaviour, e2e flows.
