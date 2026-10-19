# browser-verify: кабинет пациента (фронтенд)

Источник: результат агента `browser:cabinet` в воркфлоу `wf_917c7672-991`. Агент вернул замечания только в результате, файлом их не записал; оркестратор сохранил их здесь без изменений.

Вердикт: `request-changes`. Замечаний: 12.

Исправления: раздел «Исправления по ревью» в `coder-frontend-cabinet-report.md`.

## 1. [Существенно] Long unbroken text blows out the layout on appointments, detail and notifications pages (horizontal overflow, buttons pushed off-screen)

Файл: `frontend/src/components/patient/definition-list.tsx`

Repro (patient.lebedeva): book a slot, open /appointments/{id}, click 'Отменить запись', enter a 500-char reason with no spaces (e.g. '<b>x</b><img src=x onerror=window.__xss=1>' + 458 x 'W'; the form accepts it, POST /cancel returns 200), confirm. Result: /appointments/{id} scrollWidth = 6502 px at 1280 wide (6166 px at 375 wide, i.e. horizontal scroll on phone). On /appointments every card becomes 6167 px wide, so the 'Подробнее'/'Отменить запись' buttons and StampBadge go off-screen. On /notifications the notification 'Запись на приём отменена. Причина: <500 chars>' stretches every list item to ~6300 px and pushes every 'Отметить прочитанным' button out of view; the notification stays in the list until read, so the whole page is affected. Cause: no break-words/overflow-wrap:anywhere and no min-w-0 on the grid cell/dd (DefinitionRow dd), on the card <p> that prints cancelReason (appointments/appointment-card.tsx:49), and on the notification text <p>. The same overflow reproduces on /history (summary/recommendations/diagnosis display) and /prescriptions (dosageText/note/atcDisplay) with a mocked 400-char unbroken string (scrollWidth 4688/4693 at 1280). Patient-authored fields (reason, cancelReason: validated only by length 3..500) are the realistic trigger. XSS check is fine: the HTML-looking reason is rendered as plain text (no <img>/<b> nodes, window.__xss stays unset). TEST-DATA SIDE EFFECT (cannot be undone via the API): appointment 2731 of patient.lebedeva now carries the 500-char cancelReason, plus its cancellation notification, so /appointments (upcoming page 2, all tab) and /notifications for this demo patient currently overflow; other verifiers using this account will see it. Fix: add 'break-words [overflow-wrap:anywhere]' and 'min-w-0' to DefinitionRow dd, the card cancel-reason/reason paragraphs, notification text, history-timeline and prescription-list text blocks.

## 2. [Существенно] 'Предстоящие' tab is filled with cancelled appointments, real bookings are buried (backend 6.2 has no status filter)

Файл: `frontend/src/components/appointments/appointment-list.tsx`

Repro: log in as patient.lebedeva, open /appointments. GET /appointments?upcoming=true&pageSize=50 returns 14 items, all status=cancelled; page 1 shows 10 cards stamped 'ОТМЕНЕНА' under the tab named 'Предстоящие'. After booking a new slot the booked record appears only as the 9th card between cancelled ones; with more history it moves to page 2+. API 6.2 / ListAppointmentsQueryDto accepts only upcoming/page/pageSize/sortOrder, so the client cannot ask for status=booked, and client-side filtering would break server pagination. Wrong semantics for FR-006 ('upcoming'). Recommend recording as a backend issue (add a status filter, or make upcoming exclude cancelled) and, until then, at least a visible hint or a default sort/partition that keeps active bookings first.

## 3. [Незначительно] Keyboard focus is lost to <body> when the activated pager button becomes disabled, and after 'Повторить'

Файл: `frontend/src/components/data-display/paginated-table.tsx`

Repro: /appointments (2 pages), Tab to 'Следующая страница', Enter: page 2 loads and the Next button becomes disabled, document.activeElement = BODY (scrollY stays at the old offset, 929 px). Same when pressing 'Предыдущая страница' back to page 1. Same pattern on /history: with the API aborted press 'Повторить' after the network recovers, the error block (with the button) is replaced by the empty state and focus drops to BODY. WCAG 2.4.3 Focus Order: a keyboard user must tab from the top skip links again. The pager is a shared core component (cabinet pages use it), the retry button is in components/patient/query-error-state.tsx. Fix: move focus to the list panel/heading (as the cancel/mark-read flows already do) after page change and after a successful retry.

## 4. [Незначительно] Tab and page are not in the URL: Back from a detail page resets to 'Предстоящие', page 1

Файл: `frontend/src/components/appointments/appointment-list.tsx`

Repro: /appointments, tab 'Все записи', Next (page 2/3), open any 'Подробнее', press Back. URL stays /appointments in every state; after Back the list shows tab 'Предстоящие' and page 1/2. The state is also not shareable or reload-safe. Suggest ?tab=&page= search params.

## 5. [Незначительно] After a 409 the dialog still says 'Укажите причину отмены…' although the form is gone

Файл: `frontend/src/components/appointments/cancel-appointment-dialog.tsx`

Repro: open the cancel dialog on a booked appointment, cancel the same appointment through the API (fetch from the page or another tab), confirm in the dialog. UX itself matches §5.4: POST /cancel 409, list/detail refetched, role=alert 'Эту запись уже нельзя отменить: она отменена или состоялась.', only 'Закрыть' left and focused, Enter closes and focus goes to the list panel (list) or the h1 (detail), the cancel button disappears. But the lead paragraph (also aria-describedby of the dialog) keeps 'Укажите причину отмены. Время освободится для других пациентов.' above the error, which contradicts the message. Hide cancelLead when notCancellable is set.

## 6. [Незначительно] Spec says upcoming/past, the page offers 'Предстоящие' and 'Все записи' only

Файл: `frontend/src/app/(patient)/appointments/page.tsx`

frontend-design-spec §1/§3: '/appointments — предстоящие/прошедшие'. There is no 'Прошедшие' tab, so a patient cannot list only past visits (the all tab mixes past and future, sorted desc). Either add the tab (upcoming=false + client/ server date logic) or document the deviation.

## 7. [Незначительно] Two skip links and 20 px-high nav links (core shell, affects every cabinet page)

Файл: `frontend/src/components/layout/patient-shell.tsx`

Every cabinet page has two 'Перейти к содержимому' links (#main -> DIV#main and #main-content -> MAIN#main-content); both work but the first Tab stops are redundant. Top navigation links (Запись, Мои записи, История, Назначения, Профиль, Уведомления) measure 50-98 x 20 px, below the spec's 44 px target (§7) and below 24 px WCAG 2.2 target size unless spacing exemption applies. All cabinet content controls (tabs, cards buttons, pager, dialog buttons, mark-read) measure >= 44 px.

## 8. [Мелочь] Not-found state: redundant wording and ambiguous detail title

Файл: `frontend/src/components/patient/query-error-state.tsx`

/appointments/2500 (403 COMPARTMENT_VIOLATION), /appointments/99999999 (404) and a malformed id (400) all render the same state (BR-006 respected, one h1): heading 'Не найдено' followed by 'Запись не найдена' and 'Запись недоступна или была удалена.' (three phrases for one fact). The detail page h1 and document title in RU are 'Запись на приём', identical to the booking wizard page ('Запись на приём — МедЦентр'); EN is 'Appointment'. Also a route param like abc%24%25 is not decoded by Next, so the API request goes out double-encoded (/appointments/abc%2524%2525); harmless, returns 400 -> not found.

## 9. [Мелочь] Server-generated notification text is not localized (Russian in EN UI)

Файл: `frontend/src/components/patient/notification-center.tsx`

With the EN switch the chrome, titles, dates and stamps change (html lang=en, 'My appointments — MedCenter'), but notification bodies ('Запись на приём отменена. Причина: …', 'Вы записаны на приём. Начало: …') stay Russian, as do doctor and service names. Names are allowed by spec §7; notification text comes from the notification service (backend). Dates inside the text are correctly converted to Europe/Minsk by localizeInstants.

## 10. [Мелочь] favicon.ico returns 404

Файл: `frontend/src/app/(public)/layout.tsx`

GET http://localhost:3000/favicon.ico -> 404 on the login page load (the only non-2xx request seen apart from the deliberate 403/404/400/409). Console and page-errors logs are otherwise clean.

## 11. [Мелочь] History and prescriptions were verified live only as empty states; with-data states checked with mocked responses

Файл: `frontend/src/components/patient/history-timeline.tsx`

patient.lebedeva has no encounters, so GET /me/history and /me/prescriptions return empty (empty states OK, title 'История приёмов — МедЦентр'). With-data rendering was checked by routing the endpoints to DTO-shaped bodies (types in patient-types.ts match apps/encounter-service HistoryItemDto/PrescriptionItemDto): history shows ICD chips with verification, summary, recommendations, 'Диагноз не указан' for an empty diagnosis, pager; prescriptions branch on kind correctly (medication: ATC chip + display + dosage + note, status stamp; service: LAB-101 chip, no ATC; cancelled medication without atcDisplay). Not yet confirmed against a real encounter-service record. Minor a11y: the 'Запись на приём' links repeat per entry and prescription <article>s have no accessible name (context is available through the article/list).

## 12. [Мелочь] Coverage summary of this verification (no defect): what was walked and passed

Файл: `tasks/TASK-001/coder-frontend-cabinet-report.md`

Session cabinet-verify (closed), patient.lebedeva, live stack. PASSED: all six pages load with only 200 responses (plus deliberate 403/404/400/409); console and page errors empty; axe-core 4.14 (wcag2a/aa/21/22aa + best-practice) 0 violations on /appointments, /appointments/{id}, /history, /prescriptions, /notifications, /profile; no horizontal scroll at 375 px on any page with normal data (dialog fits, 16 px gutters). Booking via the wizard UI worked (POST /appointments 201 -> detail 2683). Cancel flow: dialog focuses the textarea, focus trap (Tab/Shift+Tab) OK, empty/2 chars/whitespace/501 chars give aria-invalid + aria-describedby + role=alert text + focus on the field and send no request, Escape returns focus to the trigger, valid reason -> POST /cancel 200, list/detail/unread-count refetched, toast 'Запись отменена', cancel button removed, focus on tabpanel (list) or h1 (detail); 409 flow OK on both list and detail; slots freed (free again in GET /doctors/{id}/slots). ARIA tabs: roving tabindex, Arrow/Home/End, aria-controls, labelled panel. Notifications: mark read via keyboard -> POST /read 204, list+count refetch, bell 48 -> 47, toast, focus on list; unread filter ?unread=true and pager work. Profile matches raw GET /me and /me/patient (birthDate 1992-11-02 shown as 2 ноября 1992 г., no timezone shift); a failing /me/patient shows a per-card 'Нет связи с сервером' + retry while the account card stays. Empty states ('Предстоящих записей нет' + CTA, 'Записей нет'), badges for booked/noshow/fulfilled and the 'Врач не указан/Услуга не указана' fallbacks (mocked list) fine; role guard sends the patient to /403 on /admin/* and /doctor/*. Test data created by this run (all cancelled, slots free): appointments 2683, 2693, 2696, 2731 (500-char cancel reason, see the major overflow finding), 2743; about 10 extra unread notifications; one notification marked read. The report file tasks/TASK-001/browser-verify-frontend-cabinet-report.md was NOT written because the standing constraints of this agent forbid writing report .md files and say to return findings directly; this structured output carries the full content. Screenshots are only in the scratchpad.
