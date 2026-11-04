Status: done

Examined (read fully, compared with backend DTOs/services where relevant):
- users: users-panel, users-table, users-filter-form, use-admin-users, user-form-dialog, user-fields, user-schema, use-practitioner-role-options
- services: panel, table, form dialog, schema, hooks
- rooms: panel, table, form dialog, schema, usage drawer, hooks
- schedules: panel, table, filters, editor, form dialog, actor fields, schema, windows rules + editor, week plan, generation dialog/range, slot grid, delete dialog, pickers, hooks
- terminology: panel, import panel, outcome, value-set table, hooks, schema (vs backend import service)
- analytics: panel, filters, period, series, report-range, use-analytics, group table, chart (partly)
- audit: panel, filter, filters form, table, hooks, types; use-debounced-commit, live-search, use-step-back, use-idempotency-key, submit-button
- consent (admin page): admin-patient-consent, staff-consent-panel, record form + schema + hook, revoke action/dialog, scan download, use-consent
- shared: use-admin-mutation, apply-server-error, problem-of, confirm-dialog, delete-confirm, admin-problem, query-state, use-form-banner, form-actions, form-field, option-select, paginated-table, dropdown-menu (structure), dialog (structure), date-picker (typed input), invalidation.ts, query-keys.ts
- i18n: ru/en parity (1514 keys each, no gaps), no hardcoded Russian/English literals in admin or consent components, static t() keys all resolve (the few scanner hits were namespace false positives)
- Contract checks that came out clean: list query params (users, services, schedules, audit), password pattern vs IsStrongPassword, schedule horizon/window/duration limits, service/room/user DTO limits, error-code mapping (EMAIL_TAKEN, SELF_LOCKOUT, ROOM_IN_USE, SERVICE_IN_USE, SCHEDULE_IN_USE, SCHEDULE_OVERLAP, IMPORT_RUNNING, SNAPSHOT_NOT_BUNDLED, TERMINOLOGY_NOT_FOUND)
- Covered by OTHER units (not duplicated): be-catalog-08 (slot grid 20 limit), be-catalog-13 / be-practitioner-05 (clearing descriptions -> 500), be-catalog-05 (service cannot be deactivated), be-auth-users-01 (full-name search), be-auth-users-03 (future birth date on the server), be-auth-users-06 (password reset), be-catalog-11 (schedule order), be-catalog-09 (slots not reconciled after PATCH), be-patient-01 (RelatedPerson cannot be created), tz-matrix-08/09/10/11, be-analytics-01 (UTC date)

Findings written: fe-admin-01 .. fe-admin-06
- 01 audit filter: stale validation error after the draft returns to the applied value (low, bug)
- 02 rooms: clearing the floor on edit is silently ignored (low, bug)
- 03 admin consent page does not name the patient (medium, ux, needs decision)
- 04 audit actor names only for the first 100 accounts (low, robustness)
- 05 schedule «delete» only deactivates when slots had bookings, toast says deleted, room/service pinned (low, ux, needs decision)
- 06 admin create-user accepts a typed future birth date (low, bug)

Not reported on purpose (judged by code, low value or already an owner question):
- admin dialogs can be dismissed while the request runs (failure then unseen; success still toasts) - consent dialogs guard this, admin ones do not: very low
- terminology list is refetched at 202, before the background import finishes: the UI says the progress is in the audit journal and only one snapshot is bundled
- analytics = 35 parallel requests per view: already in TASK-005 open questions (T8)
- service names in schedule pickers are always Russian in the English UI (admin lists read with Accept-Language: ru on purpose)

Remaining: nothing planned.
