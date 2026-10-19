# code-reviewer: кабинет пациента (фронтенд)

Источник: результат агента `review:cabinet` в воркфлоу `wf_917c7672-991`. Агент вернул замечания только в результате, файлом их не записал; оркестратор сохранил их здесь без изменений.

Вердикт: `request-changes`. Замечаний: 17.

Исправления: раздел «Исправления по ревью» в `coder-frontend-cabinet-report.md`.

## 1. [Существенно] keepPreviousData carries the previous TAB's data into the new tab (wrong content and a false empty state)

Файл: `frontend/src/components/appointments/use-appointments.ts:21`

The `tab` is part of the query key, but `placeholderData: keepPreviousData` returns the data of ANY previous key. Checked with @tanstack/query-core 5.104.1: after switching the observer from `{tab:'upcoming'}` to `{tab:'all'}`, `getCurrentResult().data` is still the upcoming page and `isPlaceholderData` is true. For a patient with 0 upcoming but 17 historical appointments, opening 'Все записи' first shows the upcoming result under the 'all' tab (`appointment-list.tsx:61-66`). That means 'Записей нет' (EmptyAppointments with tab='all') is shown, with the old pager and old cards, until the request returns. The comment says paging is meant to keep the previous page, not other tabs. Fix: keep the placeholder only while the tab is unchanged, e.g. `placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1]?.tab === params.tab ? previous : undefined`, or hide the panel body while `query.isPlaceholderData` and the tab differs. Add a test: switch tab with a pending second request and assert no stale cards and no empty state.

## 2. [Существенно] Focus falls to <body> when the last unread notification is marked read on the 'Unread' tab

Файл: `frontend/src/components/patient/notification-center.tsx:105-108`

`onSuccess` runs `listRef.current?.focus()` AFTER the awaited invalidation. On the 'Непрочитанные' tab the refreshed list is empty, so `NotificationItems` (line 83) returns `EmptyState` and `listRef.current` is null. The clicked button is gone too, so `document.activeElement` becomes `body`; keyboard and screen-reader users lose their position (WCAG 2.4.3). Clearing the unread list one item at a time always ends in this case. The same class of problem was handled for the cancel flow with `useFocusFallback`. Fix: focus a container that always exists (the tabpanel div, with `tabIndex={-1}`), or reuse `useFocusFallback`; also announce the empty state politely. Add a test: unread tab with one item, mark it read, assert focus is not on `body`.

## 3. [Незначительно] 'Не отменять' and Escape stay active while the cancel request is in flight; success feedback is lost

Файл: `frontend/src/components/appointments/cancel-appointment-dialog.tsx:55`

Only the submit button is disabled during `pending`. If the user presses 'Не отменять' or Escape after submitting, the dialog unmounts and the mutation-level `onSuccess: onCancelled` (`use-cancel-form.ts:31`) never fires for an unmounted observer. The hook-level invalidation still runs, so the appointment becomes cancelled with no toast, after the user clicked a button labelled 'Не отменять'. Fix: disable the close controls and ignore Escape while `pending`, or move the success toast and onCancelled side effect into hook-level callbacks.

## 4. [Незначительно] Lost connection shows 'Внутренняя ошибка' in mutation banners while the global toast says 'Нет связи'

Файл: `frontend/src/components/appointments/cancel-appointment-dialog.tsx:52`

`networkProblem()` is `{status:0, errorCode:'INTERNAL'}`. `QueryErrorState` handles this (`isOffline`), but the mutation banners render `<ProblemBanner problem={...}/>` directly: the cancel dialog (line 52) and the mark-read banner (`notification-center.tsx:136`). The user sees the headline 'Внутренняя ошибка' plus an INTERNAL chip, while the central error effect toasts `errors.NETWORK`. Fix: share the `isOffline` branch (a `MutationProblem` helper next to `QueryErrorState`).

## 5. [Незначительно] Stale mark-read error banner is never cleared

Файл: `frontend/src/components/patient/notification-center.tsx:115`

`failure: mutation.error` is shown until the next mutate call. After a failed mark-read (e.g. 404), the banner stays when the user switches tab or page, or after the list is refreshed. Fix: call `mutation.reset()` on tab or page change and after the refresh, or auto-dismiss. Also `useCallback` with `[mutation, ...]` (lines 101-114) is a no-op because `mutation` changes every render; destructure `mutate` instead.

## 6. [Незначительно] List pages render NotFoundState (<h1>) next to their own <h1>, and with misleading text

Файл: `frontend/src/components/patient/query-error-state.tsx:53`

The report says two <h1> were avoided on the detail page, but the lists use the same component: `appointment-list.tsx:63`, `history-timeline.tsx:90`, `prescription-list.tsx:94`, `notification-center.tsx:137`. On 404 or COMPARTMENT_VIOLATION the page has its own `<h1>` (e.g. `appointment-list.tsx:112`) plus `NotFoundState`'s `<h1>'Не найдено'`. The subtitle also reads 'История пуста' / 'Назначений нет', which is wrong for an error. Rare, since the list endpoints do not normally 404, but it is cheap to fix: for list pages treat a not-found as the ProblemBanner path, or reuse `isMissingError` to render an `EmptyState`.

## 7. [Незначительно] Fifth parallel Europe/Minsk formatter (DRY); spec §9 asks for lib/format/datetime.ts

Файл: `frontend/src/components/patient/clinic-date.ts:10`

The same zone and ru-BY/en-GB mapping already exist in `components/doctor/clinic-time.ts:13`, `lib/utils.ts:1` (`formatMinskDateTime`), `components/booking/slot-time.ts`, `components/admin/shared/admin-dates.ts` and `components/admin/schedules/slot-grouping.ts`; `CLINIC_TIME_ZONE` is exported twice. The cabinet version is the most complete and well tested. Recommendation: after the area merge, hoist it to `lib/format/datetime.ts` (core) and let the other areas import it. Not a blocker for this area. Also `new Intl.DateTimeFormat` is built per call (lines 25, 32, 39, 47); cache one formatter per locale and kind.

## 8. [Незначительно] UI state (tab, page) is not in the URL

Файл: `frontend/src/components/appointments/appointment-list.tsx:78`

Web Interface Guidelines: tabs, filters and pagination should be reflected in the URL. Here `useState` holds the appointments tab and page (line 78-80), the notifications tab and page (`notification-center.tsx:122-123`), and the history/prescriptions page (`history-timeline.tsx:107`, `prescription-list.tsx:111`). Reload, Back and link sharing all reset to page 1 / the first tab. The frontend spec does not require it, so this is a recommendation: `?tab=&page=` via `useSearchParams`.

## 9. [Незначительно] Spec §6 scenarios B and E have no working E2E; the B placeholder is stale

Файл: `frontend/e2e/cancel-appointment.spec.ts:10`

The spec lists B (patient cancels with a reason) and E (notifications: counter polling, mark read) as Playwright scenarios (NFR-011). `cancel-appointment.spec.ts` is still `test.fixme` with selectors that no longer match: the real names are 'Отменить запись: …' (aria-label), 'Причина отмены' and 'Подтвердить отмену'. There is no e2e file for notifications. Out of the area's owned paths (the implementer said so), so assign it to the test-generator step. The 409 `APPOINTMENT_NOT_CANCELLABLE` path through the central error effect (list refresh while the dialog stays mounted) is only verified by hand in the browser: unit specs use a plain QueryClient and have no 409 case at list or detail level.

## 10. [Незначительно] Test quality gaps and Golden-principle naming

Файл: `frontend/src/components/patient/notification-center.spec.tsx:159`

1) 52 of 133 test titles in the area lack the `when` clause required by GOLDEN-PRINCIPLES ('should {behaviour} when {condition}'), for example `appointment-card.spec.tsx:11,25,33,55`, `appointment-list.spec.tsx:24,32,42,111,120` and `history-timeline.spec.tsx:19,27,42`. 2) 'should not read anything for a viewer who is not a patient' (line 159) asserts synchronously right after render, so it would pass if a fetch were scheduled later; it also calls `resetCabinetState()` twice and uses a dynamic `await import` for a store that could be imported at the top. 3) Missing cases: tab switch with placeholder data (finding 1), focus after the last unread item (finding 2), Escape/close while pending, 409 at list/detail level. Otherwise the specs assert real behaviour (aria attributes, focus, request payloads, trimmed reason, Minsk time, kind branching) and are readable AAA.

## 11. [Незначительно] Plain-object lookups with server-supplied strings hit Object.prototype

Файл: `frontend/src/components/patient/notification-center.tsx:25`

`CATEGORY_KEYS[item.category]` (lines 25 and 61; category is free text per `notification-api.ts`) and `STATUS_STAMP[status]` / `hasMessage(...status...)` (`prescription-list.tsx:23,37-38`). `CONTACT_KEYS[system]` and `GENDER_KEYS[...]` (`profile-view.tsx:16-17,43,69`) have the same pattern. A value like `constructor` or `toString` returns an inherited function instead of falling through to `?? 'categoryOther'` / `'pending'`, which can crash `t()` or the stamp. The server value sets are fixed today, so this is hardening only: use `Object.hasOwn` or a `Map`.

## 12. [Незначительно] Cards and visits have no heading, so heading navigation cannot jump between them

Файл: `frontend/src/components/appointments/appointment-card.tsx:44`

The date is the card's visual headline but is a `<time>` inside `<article aria-labelledby>`, not a heading (also `history-timeline.tsx:68`, `prescription-list.tsx`). Screen-reader users who navigate by headings skip the whole list. Consider `<h2 class="serif ..."><time/></h2>` (the page is h1 -> h2, no skipped levels). WCAG 1.3.1 / 2.4.6, minor.

## 13. [Незначительно] Custom modal: background not inert, no scroll lock, fragile onClose-identity contract

Файл: `frontend/src/components/appointments/cancel-appointment-dialog.tsx:70`

The dialog relies on the core `useDialogFocus` (trap and Escape) but the page behind it stays reachable for assistive tech (`aria-modal` is the only hint) and scrolls; the wcag rule `keyboard-focus-trap` prefers native `<dialog>.showModal()` (inert background for free) or `inert` on the shell. Web Interface Guidelines also want `overscroll-behavior: contain`. The comment on line 15 says `onClose` must be stable or the trap restarts and focus is restored to a node inside the dialog. Callers do use `useCallback` today; guard it with a ref inside the dialog or the hook. Core-owned hook, so just record it.

## 14. [Незначительно] Backend observations (agree with the implementer; no edits made)

Файл: `specs/api-designer-spec.md (6.2) / apps/appointment-service/src/modules/appointments/appointment-queries.service.ts:78`

1) `GET /appointments?upcoming=true` filters by start only, so the 'Предстоящие' tab lists cancelled future appointments; the client cannot filter without breaking server paging. A `status` filter in 6.2 is the right fix. 2) Notification `text` embeds raw UTC instants; the client regex `localizeInstants` is a workaround. Prefer a structured `startsAt` or localized text. 3) `AppointmentViewDto.createdAt` is a bare date although 6.1 says RFC 3339. 4) A foreign appointment answers 403 COMPARTMENT_VIOLATION with 'belongs to another patient', while an unknown one answers 404, so existence is observable on the wire (the UI hides it, BR-006). 5) Live `/me/history` and `/me/prescriptions` with data were never seen against the real API (only mocks); the DTO types match `HistoryItemDto`, `PrescriptionItemDto`, `PatientResponseDto` and `MeResponseDto` in the sources I read.

## 15. [Мелочь] Fixtures reuse the real demo account's address

Файл: `frontend/src/components/patient/cabinet-fixtures.ts:30`

`patient.lebedeva@medcenter.test` (and the same name) appear in `cabinet-fixtures.ts:30,42` and `profile-view.spec.tsx:36,51`. It is the seeded demo login (no password anywhere in the area, verified by grep), so it is only a coupling between tests and seed data. Use a clearly synthetic address (`patient@example.test`).

## 16. [Мелочь] Naming vs Golden principles; AccountCard reuses the wrong text

Файл: `frontend/src/components/appointments/use-cancel-form.ts:14`

Booleans without is/has/can/should: `pending`, `notCancellable` (`use-cancel-form.ts:14-17`), `selected` (`segmented-tabs.tsx:43`), prop `badRequestIsNotFound`. Handlers without the `handle` prefix: `submit`, `markRead`, `close`, `cancelled` (`handleKeyDown` in `segmented-tabs.tsx` is right). `profile-view.tsx:79` passes `t('noPatient')` ('Карточка пациента ещё не создана.') as the not-found text of the ACCOUNT card. Server field messages shown in the dialog (`useReasonError`) are Russian-only core strings (`field-errors.ts`) even in the English UI (core-owned).

## 17. [Мелочь] PatientShell is mounted per page instead of in (patient)/layout.tsx

Файл: `frontend/src/app/(patient)/appointments/page.tsx:6`

Every page wraps its content in `<PatientShell>` (also the pages outside this review), so the header, bell and locale switcher remount on each navigation and focus and scroll reset with them. The layout (`layout.tsx`) already hosts `Providers` and `RoleGuard`. Moving the shell there is the Next.js idiom. The two skip links (root `#main`, shell `#main-content`) the implementer flagged are a core issue and I agree.
