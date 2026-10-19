# code-reviewer: область врача (фронтенд)

Источник: результат агента `review:doctor` в воркфлоу `wf_917c7672-991`. Агент вернул замечания только в результате, файлом их не записал; оркестратор сохранил их здесь без изменений.

Вердикт: `request-changes`. Замечаний: 19.

Исправления: раздел «Исправления по ревью» в `coder-frontend-doctor-report.md`.

## 1. [Существенно] Every new observation row pre-selects unit 'Cel' (medical data-quality hazard)

Файл: `frontend/src/components/doctor/encounter-form-defaults.ts`

Line 10: EMPTY_OBSERVATION sets unit 'Cel' for any observation code. Only 1 of the 7 seeded observation concepts (body temperature) is measured in Celsius; the others are height, weight, blood pressure, respiratory rate, heart rate and SpO2. The UCUM seed already offers kg, cm, mm[Hg], /min and %. A doctor who picks 'Масса тела', types 70 and does not touch the unit sends '70 Cel'. The server accepts it, because the value range is -50..300 and 'Cel' is a valid UCUM code, so a wrong clinical record is stored silently. Fix: start with an empty unit, so the existing 'required' validation forces an explicit choice, or derive the unit from the picked concept. Scenario C still works because the test and the doctor select Cel. Add a test that a new row has no unit selected.

## 2. [Существенно] Backend (not for this area): appointment never becomes 'fulfilled'; no-show allowed after the encounter is finished

Файл: `apps/appointment-service/src/modules/appointments/appointments.service.ts`

I confirmed the implementer's backendIssues. (1) grep over apps/ and libs/ shows nothing sets Appointment.status='fulfilled' after POST /encounters/{id}/complete, so a finished visit stays 'booked'. The journal keeps offering 'Открыть приём' and 'Неявка', and the 'fulfilled' filter is always empty. (2) markNoShow (lines 130-138) checks only the Appointment status (assertBooked), so POST /doctor/appointments/{id}/noshow returns 200 for an appointment whose encounter is already finished. That contradicts BR-008 and the ENCOUNTER_STATE_INVALID condition in API §1. The frontend softens (1) through findFinishedEncounterId and cannot prevent (2). Do not edit apps/ in the frontend task; hand this to the backend coder.

## 3. [Незначительно] Client ICD-10/ATC masks are looser than the server's class-validator (shared core file, consumed by the doctor form)

Файл: `frontend/src/lib/contracts.ts`

Lines 44-45. The client ICD10_PATTERN is /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/ but the server (libs/terminology icd10.ts) is /^[A-Z]\d{2}(\.\d{1,2})?$/. The client ATC_PATTERN allows [A-Z]{1,2} but the server (atc.ts) requires [A-Z]{2}. I verified with node that 'J06.9A', 'J06.999', 'J01C' and 'J01F10' pass the client mask and are rejected by the server. The result is a 400 VALIDATION_ERROR instead of an inline mask error. The server's custom-validator text ('atcCode must be an ATC code such as J01FA10') is not in field-errors.ts localizeFieldMessage, so the doctor sees raw English. src/lib/encounter-boundary.spec.ts even pins 'J01C' as valid. Align the client masks with libs/terminology (spec §5.3 requires parity) and fix the spec. The owner is core, not the doctor area.

## 4. [Незначительно] 422 field mapping depends on parsing the server's free-text `detail`

Файл: `frontend/src/components/doctor/encounter-problem-fields.ts`

Lines 22-29 (listedItems) take everything after the last ': ' in problem.detail and split it on commas. The format matches terminology-validator.service.ts today, and the tests pin it. It breaks silently, falling back to a banner with no field marked, if the server text changes or a code contains ': ' or ','. The durable fix is for the backend to return details[{field,message}] for 422, which the form already handles for VALIDATION_ERROR. Meanwhile keep the sample strings in encounter-problem-fields.spec.ts as the contract.

## 5. [Незначительно] Journal day lives in useState seeded once from ?date=, so URL and screen can disagree

Файл: `frontend/src/components/doctor/doctor-journal.tsx`

Line 56: dateKey is initialised from the URL only on mount, and writeDayToUrl uses replaceState. If the doctor is on /doctor/appointments?date=2026-10-21 and clicks the 'Журнал' link in the shell (same route, no params), Next updates searchParams but the component stays mounted. The page keeps showing the old day while the URL says today. The comment 'a reload or the back button returns to it' is only true for reload and re-mount, because replaceState adds no history entries. Derive dateKey from useSearchParams (router.replace on change) or add a key={searchParams.toString()} remount. A journal left open overnight also keeps yesterday as 'today'.

## 6. [Незначительно] Focused 'Сегодня' button disables itself on activation and drops keyboard focus (also in schedule view)

Файл: `frontend/src/components/doctor/journal-controls.tsx`

journal-controls.tsx:41 and doctor-schedule-view.tsx:42 use disabled={dateKey === minskDateKey()} on the button that was just pressed. A disabled element cannot keep focus, so a keyboard user falls back to body (WCAG 2.4.3). Use aria-disabled with an early return, or move focus to the date field after the action.

## 7. [Незначительно] Required fields are not identified (WCAG 3.3.2, no aria-required, no marker)

Файл: `frontend/src/components/doctor/encounter-form-fields.tsx`

FieldRow (line 13) and the editors never mark summary, diagnosis code and name, recommendations, dosage and unit as required. noValidate is set, so the first hint is the post-submit error. Add aria-required and a visible marker or a 'Поля, отмеченные *, обязательны' note, in both locales.

## 8. [Незначительно] No unsaved-changes guard on the long clinical form

Файл: `frontend/src/components/doctor/encounter-complete-form.tsx`

Following the 'warn before leaving with unsaved changes' guideline: navigating to the journal, the patient link in the header, or a reload discards the whole note (summary, diagnoses, observations, drugs) with no warning. Add a beforeunload handler while methods.formState.isDirty && !complete.isSuccess. The 409 replay legitimately replaces the form, per spec C2.

## 9. [Незначительно] RATE_LIMITED does not disable submit for the Retry-After period (§5.4)

Файл: `frontend/src/components/doctor/encounter-complete-form.tsx`

Line 69: the submit button is disabled only while complete.isPending. Spec §5.4 says RATE_LIMITED means a toast, respecting Retry-After and disabling submit for that period. The core toast and banner show 'Повторите через N с', but the button is clickable immediately. The same applies to NoshowButton and OpenEncounterButton. Add a small shared hook (disabledUntil from problem.retryAfter) in core and use it in these three places.

## 10. [Незначительно] 409 message 'already completed' is shown for any ENCOUNTER_STATE_INVALID

Файл: `frontend/src/components/doctor/open-encounter-button.tsx`

Line 39 overrides every ENCOUNTER_STATE_INVALID with 'Приём … уже оформлен, но найти его не удалось'. API 7.1 also returns this code when the appointment is cancelled or noshow, for example when the journal is stale. In that case the text is wrong, and the doctor has already paid for up to 5 sequential 100-item history requests in findFinishedEncounterId. Only use the override when the history lookup actually ran and found nothing; otherwise show the catalogue message. Consider refetching the journal so the stale row disappears.

## 11. [Незначительно] React key = diagnosis code; the form allows the same code twice

Файл: `frontend/src/components/doctor/diagnosis-list.tsx`

Line 16: key={diagnosis.code}. The completion form does not reject duplicate ICD-10 codes (the server does not dedupe either, and assertIcd10Codes only dedupes for validation). Two rows with J06.9 produce duplicate keys, with a React warning and unstable rendering in the read-only record and the history timeline. Use `${code}-${index}`, as the observation and service lists already do. Consider a zod refine for unique codes.

## 12. [Незначительно] Server field messages are Russian-only in the EN locale

Файл: `frontend/src/components/doctor/use-encounter-form.ts`

Line 52 uses applyProblemToForm (lib/api/field-errors.ts), whose VALIDATION_MESSAGES are hard-coded Russian strings that bypass lib/i18n. With the UI in English, a server 400 on a form field shows Russian text or raw class-validator English. Core issue; route localizeFieldMessage through translate() with keys in both catalogues.

## 13. [Незначительно] Combobox: no result announcement and option targets below 44 px

Файл: `frontend/src/components/doctor/terminology-combobox.tsx`

Line 229: options use py-1.5 text-sm, about 32 px tall, against the 44 px target rule in spec §7. The list never announces 'N вариантов' or 'ничего не найдено' through a polite live region (WCAG 4.1.3), so a screen-reader user typing a code hears nothing when there are zero or some matches. Add a visually hidden role=status line driven by items.length, and min-h-[44px] on options (or at least on coarse pointers).

## 14. [Незначительно] Closed-list select silently truncates at 100 concepts

Файл: `frontend/src/components/doctor/value-set-select.tsx`

useExpansion(valueSet,'') requests count=100 (doctor-api.ts:31 EXPAND_COUNT) and the select renders expansion.data.items without comparing items.length with expansion.total. The current seed is small (10 services, 7 observations, 22 units), but after a real NSI import the doctor could not select concepts 101 and beyond, with no warning. Show a notice, or switch to the search combobox, when total > items.length.

## 15. [Незначительно] Test hygiene: naming, misplaced jest.setTimeout, duplication and slowness

Файл: `frontend/src/components/doctor/doctor-journal.spec.tsx`

(1) 50 of 170 test names in the area lack the ' when ' clause required by the golden principle ('should accept a real calendar date', 'should upper-case the code as the user types', and so on). (2) doctor-journal.spec.tsx:56 has jest.setTimeout(30_000) in the middle of the describe block, between two tests. It works because describe runs at collection, but it looks like a botched edit and the journal spec does not even type long strings. (3) encounter-view.spec.tsx repeats the same four userEvent.type blocks four times instead of using fillRequired() from encounter-form-test-utils. (4) Suites take 45-73 s each (113 s for 16) because of per-keystroke typing, and the 30 s timeout hides it; use userEvent.setup({delay:null}) or paste for long text. (5) Fixtures use LOINC-like codes ('8310-5', 'A01.001') that are not the seeded ones (20006 etc.); the journal spec compares against the real current Minsk day, which is flaky around midnight.

## 16. [Незначительно] Scenarios C and C2 have no automated E2E (placeholder is stale)

Файл: `frontend/e2e/doctor-encounter.spec.ts`

Spec §6/NFR-011 requires Playwright for C (journal → open → complete with J06.9, 36.6 Cel and J01FA10) and C2 (replay → 409 → read-only). The only doctor E2E is test.fixme, and it is wrong: it looks for a link 'Открыть приём' (it is a button) and expects the form to become disabled (the form is replaced by the read-only record). The path is outside the owned paths, but the live walk in the implementer report is the only evidence. Hand it to test-generator.

## 17. [Мелочь] Unchecked casts weaken type safety

Файл: `frontend/src/components/doctor/value-set-select.tsx`

value-set-select.tsx:43,71 cast the shared ForwardedRef to Ref<HTMLInputElement>/Ref<HTMLSelectElement>; journal-controls.tsx:57 casts event.target.value as StatusFilter; use-encounter-form.ts:50,55,83 cast strings to FieldPath. They are contained and the tests cover them, but a type guard (isStatusFilter) or two separate forwardRef components would remove the casts. The area has no any and no '!'.

## 18. [Мелочь] Spec says confirm-dialog; implementation uses an inline two-step confirmation

Файл: `frontend/src/components/doctor/noshow-button.tsx`

frontend-design-spec §4 lists NoshowButton as 'врач, confirm-dialog'. The inline confirm (focus into Confirm, Escape returns focus, focus to the row's patient link after success) is accessible and tested, and the live walk verified it, so this is a documented deviation rather than a defect. The confirmation group's aria-label does not name the patient, so with several rows open the same group name repeats.

## 19. [Мелочь] Review report file not written; verification evidence recorded here instead

Файл: `tasks/TASK-001/code-reviewer-frontend-doctor-report.md`

The task asked for this Russian report file, but a system-level rule forbids writing report .md files, so the findings are returned only through this structured output. Evidence from my own runs in frontend/: `npx tsc --noEmit` exit 0 (whole project); `npx jest src/components/doctor "src/app/(doctor)" src/lib/i18n` 16 suites, 179 tests, all passed; `npx next lint -d "src/app/(doctor)" src/components/doctor` no warnings or errors. A TypeScript AST script found no file over 300 lines (largest is terminology-combobox.tsx at 237) and no function over 30 lines, no any, no non-null '!', and no named function or forwardRef without a return type. There are no localStorage/sessionStorage/console/dangerouslySetInnerHTML uses in the area, no passwords or tokens in code or tests, and no TODO/FIXME. ru/en catalogues are at parity (188 doctor keys each) and every key used exists. Positive: API paths, query params, the {items,meta} envelope, the 201/200 idempotent open and the 409 → read-only flow match the services; the 422 INVALID_ICD10_CODE / TERMINOLOGY_NOT_FOUND detail formats match terminology-validator.service.ts; COMPARTMENT_VIOLATION is shown as 404; the shared queryKeys/invalidateFor tables are used correctly; focus handling after complete, 409 and no-show is deliberate and tested.
