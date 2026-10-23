# Frontend Design Specification

> Living specification. Entry point — [`MANIFEST.md`](MANIFEST.md). Sections are appended per task
> with the `### [TASK-N] ...` prefix. Structure template — `../spec-desc.md`.
> Базовая архитектура — [`architect-architecture.md`](architect-architecture.md); контракты API —
> [`api-designer-spec.md`](api-designer-spec.md) (далее «API §N»).

---

### [TASK-001] Клиент Next.js — дизайн-система «Медицинская карта», страницы, компоненты, состояние (2026-10-04)

**Источники:** `specs/architect-architecture.md` (§1 CLIENT, ADR-006/007/009/012/013/015),
`specs/api-designer-spec.md` (59 эндпоинтов, каталог 16 errorCode), `tasks/TASK-001/requirements-analyst-requirements.md`
(21 FR, 9 BR, 11 NFR, A-6/A-8), `tasks/TASK-001/brainstorming-design.md` (D6, D7).
**Итог:** дизайн-спека `apps/web` (Next.js App Router): дизайн-направление, карта маршрутов по ролям,
каталог доменных компонентов, модель состояния (TanStack Query + Zustand), карта ошибок errorCode → UX,
6 E2E-сценариев, трассируемость 21 FR.

#### 0. Дизайн-направление «Медицинская карта»

Продукт = рабочий инструмент клиники + потребительский сервис записи. Направление — **бумажная
медицинская карта**: тёплая бумага, чернильная типографика, волосяные линии вместо теней, статусы —
как «штампы», терминологические коды — как монотипные чипы. Осознанно избегаем generic-AI эстетики:
без фиолетовых градиентов, glassmorphism, emoji-иконок и pill-кнопок везде.

**Токены (shadcn CSS-переменные, light-тема — единственная в объёме; тёмная — задел через токены):**

| Токен                              | Значение                        | Назначение                                                                    |
| --------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| `--background`                        | `#FAF9F6`                             | тёплая бумага, фон приложения                                  |
| `--card`                              | `#FFFFFF`                             | карточки, панели                                                          |
| `--foreground`                        | `#1C2B33`                             | чернила (сине-графит)                                                  |
| `--muted-foreground`                  | `#5B6770`                             | вторичный текст                                                           |
| `--primary`                           | `#0F766E`                             | хирургический бирюзовый: CTA, активные состояния |
| `--primary-foreground`                | `#ECFDF5`                             | текст на primary                                                                 |
| `--secondary` / `--accent`          | `#F1EFE9`                             | светлый шалфей: ховеры, чипы                                     |
| `--destructive`                       | `#B3261E`                             | ошибки, cancel/noshow                                                             |
| `--warning`                           | `#B45309`                             | охра: noshow, предупреждения                                          |
| `--success`                           | `#2F6B4F`                             | fulfilled, «слот свободен»                                                |
| `--border` / `--input` / `--ring` | `#E5E2D9` / `#E5E2D9` / `#0F766E` | волосяные линии, фокус                                               |

**Типографика** (next/font, `display: swap`): заголовки — **PT Serif** 600/700 (кириллический
шрифт, «журнальная» иерархия, tracking −0.01em); интерфейс — **Inter** 400/500/600; коды
(МКБ-10/АТХ/UCUM, `requestId`) — **JetBrains Mono**. Шкала: 12/14/16/20/24/32. Лейблы форм —
uppercase, tracking +0.08em, 12px. **Радиус 6px** (карточки 8px), тени не используются — глубина
только границами. Иконки Lucide, stroke 1.5.

**Фирменные паттерны:**

- `StampBadge` — статус как штамп: uppercase, tracking +0.08em, рамка 1.5px, без заливки
  (`booked`=primary, `cancelled`=destructive, `noshow`=warning, `fulfilled`=success, `free`/`busy` — для слотов).
- `CodeChip` — код терминации в JetBrains Mono на `#F3F1EA` с 1px рамкой (`J06.9`, `J01FA10`, `Cel`).
- Плотность: пациент — comfortable; врач/админ — compact (строки таблиц h-11, sticky header,
  hover `#F7F5EF`), без зебры.
- Движение: 150 мс ease-out, skeleton-шиммер едва заметный, `prefers-reduced-motion` уважается.

**Каркас (wireframe, StaffShell):**

```
┌──────────┬────────────────────────────────────────────────┐
│ logo     │ Пациенты дня            🔔(3)  RU  Иванов И. ▾ │
│──────────│────────────────────────────────────────────────│
│ Журнал   │ 09:00  Иванов И.    booked   [Открыть приём]   │
│ Schedule │ 09:30  Петрова А.   booked   [Открыть приём]   │
│ Пациенты │ 10:00  Сидоров К.   noshow   штамп · —         │
│ ———      │        … PaginatedTable ← 1 2 3 … →            │
│ Admin ▾  │                                                 │
└──────────┴────────────────────────────────────────────────┘
   PatientShell: верхняя навигация (Запись · Мои записи · История ·
   Назначения · Профиль) — consumer-режим, карточки вместо таблиц.
```

#### 1. Каркас приложения, маршрутизация, guard-матрица

Nx: приложение `apps/web` (см. §9). App Router, route groups; публичный каталог — **RSC**
(серверный fetch публичных эндпоинтов API §4.1/§5.1.1/§5.2.8, без клиентского JS для списков);
всё авторизованное — client components + TanStack Query. `middleware.ts` (edge): наличие cookie
сессии → редирект на `/login` с `returnTo`; проверка подписи JWT — не в middleware (защиту делает
guard-слой BFF, ADR-009/013), роль-гейтинг в UI — только UX.

| Route group   | Роль                  | Маршруты                                                                                                                                            | Редирект после входа |
| ------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `(public)`  | любой / аноним | `/`, `/doctors`, `/doctors/[doctorId]`                                                                                                                | —                                     |
| `(auth)`    | аноним              | `/login`, `/register`                                                                                                                                   | по роли (ниже)               |
| `(patient)` | PATIENT                   | `/booking`, `/appointments`, `/appointments/[appointmentId]`, `/history`, `/prescriptions`, `/profile`, `/notifications`                      | `/booking`                           |
| `(doctor)`  | DOCTOR                    | `/doctor` → `/doctor/appointments`, `/doctor/schedule`, `/encounters/[encounterId]`, `/patients/[patientId]`                                     | `/doctor/appointments`               |
| `(admin)`   | ADMIN                     | `/admin` → `/admin/analytics`, `/admin/users`, `/admin/services`, `/admin/rooms`, `/admin/schedules`, `/admin/terminology`, `/admin/audit` | `/admin/analytics`                   |

Мismatch роли → `403.hbs`-страница `ForbiddenState` («Недостаточно прав»). Компартмент (BR-006,
ADR-013): в patient-роутах UI **никогда** не предлагает выбор пациента — все чтения через
`/me/*`-семейство (API §3.1, §6.2, §7.6–7.7, §8.1).

#### 2. Аутентификация и сессия (SMART PKCE, ADR-009/KDR-2)

**Token broker в Next.js** (`app/api/auth/*` route handlers, серверная сторона клиента): код
PKCE-обмена и refresh-токен не попадают в JS браузера (OWASP NFR-006).

| Route handler                | Назначение                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET  /api/auth/authorize` | генерирует`code_verifier`+S256 challenge (httpOnly cookie `mc_pkce`), 302 → `GET /oauth/authorize` (API 2.1.2) с `state=returnTo`                   |
| `GET  /api/auth/callback`  | сверяет`state`, обменяет `code` → `POST /oauth/token` (2.1.3), ставит `mc_rt` (httpOnly, Secure, SameSite=Lax, 14 d), 302 → `returnTo` |
| `GET  /api/auth/session`   | отдаёт access-токен в память:`{ accessToken, expiresAt, role, scope, patientRef?, fhirUser? }` (refresh при истечении)                  |
| `POST /api/auth/refresh`   | refresh-rotation через 2.1.3 (`grant_type=refresh_token`), новый `mc_rt` + access в ответ                                                           |
| `POST /api/auth/logout`    | `POST /oauth/token/revoke` (2.1.4), очистка cookies, → `/login`                                                                                             |

- **Допущение UI-1:** форма ввода логина/пароля рендерится `auth-service` внутри `GET /oauth/authorize`
  («public (сессия логина)», API §2.1.2); POST /auth/login в API нет — эндпоинт не изобретаем.
  Клиентский `/login` = брендированный входной экран с кнопкой «Войти» (→ `/api/auth/authorize`) и
  ссылкой на `/register`.
- **Scopes:** клиент запрашивает `launch patient/*.read patient/*.write user/*.read user/*.write`
  offline через refresh; сервер выдаёт подмножество по роли (скоуп-матрица API §0). Роль берём из
  claim `role` (UI-навигация; авторитет — сервер).
- `apiFetch` (lib/api): Bearer из session store; `401 UNAUTHENTICATED` → single-flight
  `POST /api/auth/refresh` → retry 1 раз; `401 TOKEN_REVOKED` или повторный 401 → logout.
- **Draft бронирования переживает redirect:** черновик мастера в `sessionStorage` (ключ `booking-draft`),
  `state` возвращает на `/booking`; после входа — восстановление шага 4.
- `Idempotency-Key` (API §0): uuid v4 генерируется при создании интента (шаг 4 мастера, диалог
  генерации слотов, импорт терминологии) и **переиспользуется** при ретраях того же интента.

#### 3. Информационная архитектура: страницы → компоненты → эндпоинты → FR

**(public + auth)**

| Маршрут          | Содержимое                                                                           | Компоненты               | API        |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------- | ---------- |
| `/`                   | навигационный лендинг: услуги + спецы                           | RSC`ServiceGrid`, `DoctorCard` | 5.1.1, 4.1 |
| `/doctors`            | каталог врачей, фильтры услуга/специальность/поиск | `DoctorCatalog`, `FilterBar`   | 4.1, 5.1.1 |
| `/doctors/[doctorId]` | карточка врача + свободные слоты, CTA «Записаться»      | `DoctorCard`, `SlotPicker`     | 4.2, 5.2.8 |
| `/login`              | вход (UI-1),`returnTo`                                                                   | `AuthEntry`                      | 2.1.2      |
| `/register`           | саморегистрация пациента (A-6)                                          | `RegisterForm`                   | 2.2.6      |

**(patient)**

| Маршрут                    | Содержимое                                                             | Компоненты                                              | API                    | FR         |
| --------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------- | ---------- |
| `/booking`                      | мастер: услуга → врач → слот → подтверждение | `BookingWizard` (4 шага, черновик, Idempotency-Key) | 5.1.1, 4.1, 5.2.8, 6.1 | FR-003/004 |
| `/appointments`                 | предстоящие/прошедшие                                        | `AppointmentList`, `StampBadge`                               | 6.2                    | FR-006     |
| `/appointments/[appointmentId]` | детали + отмена                                                      | `AppointmentCard`, `CancelAppointmentDialog`                  | 6.3, 6.4               | FR-005/006 |
| `/history`                      | моя история приёмов                                             | `PatientHistoryTimeline`                                        | 7.6                    | FR-006     |
| `/prescriptions`                | мои назначения                                                      | `PrescriptionCard`                                              | 7.7                    | FR-007     |
| `/profile`                      | профиль + FHIR-пациент                                             | `ProfileForm` (read-only), `ProfileCard`                      | 2.2.7, 3.1             | FR-001     |
| `/notifications`                | центр уведомлений                                                | `NotificationCenter`                                            | 8.1–8.3               | FR-008     |

**(doctor)**

| Маршрут                | Содержимое                                                                          | Компоненты                                                                                                   | API                | FR          |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `/doctor/appointments`      | журнал на дату (from/to), фильтр статусов                           | `PaginatedTable`, `NoshowButton`, действие «Открыть приём» (только `booked`, BR-008) | 6.5, 6.6, 7.1      | FR-009/011  |
| `/doctor/schedule`          | своё расписание и слоты                                                   | `DoctorScheduleView` (окна недели + слоты)                                                            | 5.2.7              | FR-009      |
| `/encounters/[encounterId]` | карточка приёма; до complete — пусто, после — read-only           | `StatusBanner`, `EncounterCompleteForm`                                                                            | 7.2, 7.3           | FR-011…014 |
| `/patients/[patientId]`     | карточка пациента: история, назначения, доверенные | `PatientHeader`, `PatientHistoryTimeline`, `PrescriptionCard`, `RelatedPersons`                                | 3.2, 3.3, 7.4, 7.5 | FR-010      |

**(admin)** — все под StaffShell, раздел «Admin» виден только ADMIN (BR-007):

| Маршрут         | Содержимое                                                              | Компоненты                               | API          | FR     |
| ---------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------- | ------------ | ------ |
| `/admin/users`       | CRUD пользователей, роли,`isActive`, `ExternalLink`-чипы | `UsersTable`, `UserForm`                       | 2.2.1–2.2.5 | FR-015 |
| `/admin/patients/[patientId]/consent` | бумажное согласие на ЭМК пациента: статус, история, скан, форма, отзыв (только оформление, без медданных, ADR-018); ссылка из строки пользователя с `patientRef` | `AdminPatientConsent`, `StaffConsentPanel` | 3.7–3.11 | — |
| `/admin/services`    | CRUD услуг (НСИ-тип)                                                   | `ServicesTable`, `ServiceForm`                 | 5.1.3–5.1.5 | FR-016 |
| `/admin/rooms`       | CRUD кабинетов + занятость                                      | `RoomsTable`, `RoomForm`, `RoomUsageDrawer`  | 4.3–4.7     | FR-017 |
| `/admin/schedules`   | расписания + генерация слотов                            | `ScheduleEditor`, `SlotGenerationDialog`       | 5.2.1–5.2.6 | FR-020 |
| `/admin/terminology` | ValueSets, импорт снапшота                                          | `ValueSetExplorer`, `TerminologyImportPanel`   | 2.3.1–2.3.4 | FR-018 |
| `/admin/analytics`   | сводки записей/приёмов, топ услуг                     | `AnalyticsDashboard` (KPI-карты + recharts) | 9.1–9.3     | FR-019 |
| `/admin/audit`       | журнал аудита                                                         | `AuditTable`                                     | 9.4          | FR-021 |

#### 4. Каталог доменных компонентов

| Компонент                                                            | Назначение / контракт                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SlotPicker`                                                                | плитки свободных слотов по дням (mono-время,`CodeChip`-стиль); staleTime 15 s; при 409 — авто-refresh и подсветка занятого (BR-001)                                                                  |
| `BookingWizard`                                                             | 4 шага, черновик в sessionStorage,`Idempotency-Key`, маска reason (3…500)                                                                                                                                                                        |
| `AppointmentList` / `AppointmentCard`                                     | конверт`PaginatedResponseDto` → `PaginatedTable`; `StampBadge` статуса; cancel — только для владельца/ADMIN (BR-002)                                                                                                          |
| `CancelAppointmentDialog`                                                   | reason обязателен (3…500, zod), подтверждение                                                                                                                                                                                                 |
| `NoshowButton`                                                              | пометить неявку (врач, confirm-dialog)                                                                                                                                                                                                              |
| `DoctorScheduleView`                                                        | окна недели MO–SU + слоты своего расписания                                                                                                                                                                                           |
| `EncounterCompleteForm`                                                     | 4 секции: summary+diagnoses / observations / назначения / recommendations; атомарный submit`CompleteEncounterDto` (API 7.3); после `finished` — read-only + баннер (BR-003/008)                                              |
| `Icd10Combobox`                                                             | поиск по ValueSet`https://fhir.by/ValueSet/InternClassificDiseases10` через `$expand` (2.3.2) + клиентская маска `^[A-Z]\d{2}(\.\d{1,2})?$`; офлайн-фолбэк — ввод кода с `GET /terminology/validate` (2.3.3) |
| `UcumUnitSelect`                                                            | селект единиц из UCUM ValueSet (`$expand`, кэш), свободный ввод запрещён (BR-009)                                                                                                                                             |
| `AtcCodeField`                                                              | mono-поле АТХ + маска + валидация 2.3.3                                                                                                                                                                                                          |
| `NsiCodedField`                                                             | универсальный выбор system+code по НСИ ValueSet (canonical`https://fhir.by/...`)                                                                                                                                                             |
| `PatientHistoryTimeline`                                                    | лента`Encounter` с чипами диагнозов; переход в детали приёма                                                                                                                                                               |
| `PrescriptionCard`                                                          | ServiceRequest/MedicationRequest:`CodeChip` кода, dosageText, примечания                                                                                                                                                                              |
| `NotificationBell` + `NotificationCenter`                                 | поллинг`unread-count` каждые 30 с при фокусе окна (ADR-015: без SSE); «отметить прочитанным»                                                                                                                     |
| `PaginatedTable`                                                            | серверная пагинация из`meta: PageMetaDto`; сортировка sortBy/sortOrder                                                                                                                                                                |
| `ScheduleEditor`                                                            | weekly windows (MO–SU, HH:mm), horizon ≤ 90 дней, slotDurationMin; превью пересечений                                                                                                                                                          |
| `SlotGenerationDialog`                                                      | from/to в пределах горизонта,`Idempotency-Key`; результат `{ generated, skipped }` (API 5.2.5, 201); конфликт удаления расписания — `SCHEDULE_IN_USE`/каскад-чекбокс (5.2.4)                 |
| `TerminologyImportPanel`                                                    | snapshotVersion → 202 Accepted, состояние «импорт выполняется»; 409 → «уже выполняется»                                                                                                                                 |
| `RoomUsageDrawer`                                                           | занятость кабинета: Schedule/Slot references (4.7); удаление блокируется при активных расписаниях (`ROOM_IN_USE`)                                                                                         |
| `UsersTable` / `UserForm`                                                 | роли,`isActive`, деактивация (soft) с подтверждением                                                                                                                                                                                  |
| `AnalyticsDashboard`                                                        | KPI-карты + линейные/столбчатые графики (recharts через shadcn/charts — дополнение к D7); фильтр дат ≤ 366 дней                                                                                          |
| `AuditTable`                                                                | occurredAt, userId, action (create/update/delete), resourceType, resourceId,`requestId` (mono)                                                                                                                                                                      |
| `ProblemBanner`                                                             | рендер problem+json: title, detail,`errorCode`-чип, `requestId` с кнопкой «копировать»                                                                                                                                               |
| `ForbiddenState` / `NotFoundState` / `EmptyState` / skeleton-набор | системные состояния                                                                                                                                                                                                                                 |

#### 5. Состояние

##### 5.1 TanStack Query — ключи, кэш, инвалидация

Конвенция ключей: `[domain, ...identity, params]`. staleTime: каталог `services`/`doctors` 5 мин
(сервер кэширует в Redis, API §7); `slots` 15 s + refetchOnWindowFocus; `appointments` 30 s;
`notifications.unreadCount` — `refetchInterval` 30 s; терминология ValueSet — 1 ч.

| Мутация (API §)                   | Инвалидация ключей                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `POST /appointments` (6.1)              | `slots`, `appointments`, `unreadCount`                                      |
| `cancel` (6.4), `noshow` (6.6)        | `appointments`, `appointment detail`, `doctorAppointments`, `unreadCount` |
| `POST /encounters` (7.1)                | `doctorAppointments`, `encounters`                                            |
| `complete` (7.3)                        | `encounter detail`, `patient history`, `prescriptions`                      |
| `read` (8.3)                            | `notifications`, `unreadCount`                                                |
| admin CRUD users/services/rooms/schedules | соответствующие списки +`rooms usage`                      |
| `generate` (5.2.5)                      | `admin schedule slots`, `doctor schedule`                                     |
| терминология import (2.3.4)   | `valueSets`                                                                     |

##### 5.2 Zustand

`useSessionStore` (сессия из broker: role, scope, patientRef, fhirUser, expiresAt; hydrated-флаг) ·
`useUiStore` (locale, sidebar, активные фильтры) · `useBookingDraftStore` (черновик мастера,
persist → sessionStorage). Серверные данные — **только** TanStack Query.

##### 5.3 Формы: react-hook-form + zod, паритет с class-validator

Каждая DTO, попадающая в форму, имеет zod-схему в `libs/contracts/src/schemas/*.schema.ts` с
**теми же ограничениями**, что у class-validator (API §2–§7), + Jest-тест паритета (поле/правило).
Кастомные клиентские валидаторы: `icd10` (маска), `atc` (маска `^[A-Z][0-9]{2}[A-Z]{2}([0-9]{2})?$`, как в `libs/terminology`),
UCUM — только селект, пароль — зеркало `IsStrongPassword`. Итоговая инстанция истины — сервер
(422 → §5.4).

##### 5.4 Карта ошибок: errorCode → UX (API §1, все 16)

| errorCode                                | UX                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `VALIDATION_ERROR`                     | `details[]` → ошибки полей формы (aria-describedby)                                                         |
| `UNAUTHENTICATED`                      | silent-refresh flow (§2), невидимо пользователю                                                           |
| `TOKEN_REVOKED`                        | logout + тост «Сессия завершена, войдите снова»                                               |
| `FORBIDDEN_SCOPE` / `FORBIDDEN_ROLE` | `ForbiddenState`                                                                                                             |
| `COMPARTMENT_VIOLATION`                | показывать как 404 (не раскрывать существование ресурса)                          |
| `NOT_FOUND`                            | `NotFoundState`                                                                                                              |
| `METHOD_NOT_ALLOWED`                   | `ProblemBanner` (generic)                                                                                                    |
| `SLOT_CONFLICT`                        | `SlotPicker`: refresh слотов, тост «Слот уже занят», шаг мастера сохранён (BR-001) |
| `APPOINTMENT_NOT_CANCELLABLE`          | refresh записи, кнопка отмены скрыта (BR-002)                                                          |
| `ENCOUNTER_STATE_INVALID`              | refresh приёма, баннер «Приём уже оформлен», read-only (BR-003/008)                              |
| `CONSENT_REQUIRED`                     | 7.1/7.3: `ConsentRequiredNotice` (нет согласия → регистратура или бумажное согласие в карточке пациента, «Экстренная помощь» с причиной 10–500, повтор с `emergencyReason`); центральный эффект обновляет статус согласия (ADR-019) |
| `CONSENT_ALREADY_ACTIVE`               | 3.8: сообщение в форме «сначала запишите отзыв» (не общий баннер); центральный эффект обновляет статус |
| `SCHEDULE_OVERLAP`                     | подсветка конфликтующих окон в`ScheduleEditor`                                                    |
| `INVALID_ICD10_CODE`                   | чип диагноза помечается невалидным, фокус в`Icd10Combobox` (BR-004)                     |
| `TERMINOLOGY_NOT_FOUND`                | то же для НСИ/АТХ-полей (BR-009)                                                                             |
| `RATE_LIMITED`                         | тост «Слишком много запросов», уважать`Retry-After`, disable submit на период       |
| `INTERNAL`                             | `ProblemBanner` + `requestId` для поддержки                                                                    |

#### 6. Ключевые сценарии → Playwright E2E (NFR-011)

Стенд E2E — docker-compose (сиды: Organization, врачи, услуги, кабинеты, расписание); компонентные
тесты — Jest + MSW (мок `/api/v1`).

| #  | Сценарий                                                                                                                                                          | Проверяет                                                                             |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A  | Гость:`/doctors` → врач → слот → «Записаться» → вход → черновик восстановлен → подтверждение → 201 | FR-002…004, PKCE-returnTo, Idempotency-Key                                                    |
| A2 | Два параллельных бронирования одного слота                                                                                          | 409`SLOT_CONFLICT`, refresh слотов (BR-001)                                            |
| B  | Пациент отменяет запись с reason                                                                                                                    | 6.4,`StampBadge` → cancelled, уведомление (BR-002)                               |
| C  | Врач: журнал → «Открыть приём» → complete (J06.9, 36.6 Cel, J01FA10)                                                                            | 7.1→7.3 атомарно; статус finished (FR-011…014; BR-004, BR-005, BR-008, BR-009) |
| C2 | Повторный complete того же приёма                                                                                                                    | 409`ENCOUNTER_STATE_INVALID` → read-only                                                    |
| D  | Админ: расписание + генерация слотов → слоты видны врачу и пациенту                                                | 5.2.1–5.2.6, overlap-контроль (FR-020)                                                |
| E  | Уведомления: поллинг счётчика, отметить прочитанным                                                                          | 8.1–8.3 (FR-008)                                                                              |
| F  | Аналитика + аудит с фильтрами                                                                                                                     | 9.1–9.4 (FR-019/021)                                                                          |

Дополнительно unit: zod-паритет, `apiFetch` (refresh/retry), `useBookingDraftStore`; security-чек
(UI не отправляет `patient`-параметр при `patient/*`-скоупах — ADR-013).

**Статус (2026-10-23): реализованы все сценарии A–F и security-набор** — `frontend/e2e/*.spec.ts` (`booking-flow`, `booking-conflict`,
`cancel-appointment`, `doctor-encounter`, `admin-schedule`, `notifications`, `admin-reports`, `auth-login`, `security`; заглушек `test.fixme`
нет). Дополнительно покрыты компартмент пациента, role-guards и редиректы `returnTo`. Проект Playwright `setup` (`auth.setup.ts`) один раз входит
под каждым демо-аккаунтом и сохраняет `storageState`; остальные спеки его переиспользуют (логин ограничен rate-limit). Учётные данные берутся из
git-ignored манифеста демо-сида (`tools/demo-seed/output/demo-manifest.json`), без него `setup` пропускается (`DEMO_MANIFEST_PATH` указывает другой манифест).

Запуск (нужен поднятый стек с демо-данными и веб на `:3000`, см. README):

```bash
cd frontend && E2E_BROWSER_CHANNEL=chrome npx playwright test   # установленный Google Chrome
cd frontend && npx playwright test                              # после `npx playwright install chromium`
```

`E2E_BASE_URL` задаёт origin веба (по умолчанию `http://localhost:3000`).

#### 7. i18n, локализация данных, доступность

- **next-intl**, `ru-BY` по умолчанию (NFR-008, A-8), `en` — задел: `messages/{ru,en}.json`,
  namespace `common/booking/doctor/admin/errors`; переключатель в шапке. Названия услуг/диагнозов —
  display из сервера (терминология), не переводим клиентом.
- Даты: хранение RFC 3339 UTC (API §0) → отображение `Europe/Minsk` через `Intl.DateTimeFormat`;
  ввод — локальное время (как в `WeeklyWindowDto`).
- Локализация ошибок: `errorCode` → ключ `errors.<errorCode>` (текст из каталога §1).
- **WCAG 2.1 AA:** skip-link; focus-visible ring 2px `--ring`; фокус-трапы в диалогах (shadcn);
  `aria-live` для тостов и конфликта слота; контраст body 13:1, primary на бумаге — только для
  крупного/жирного текста; все инпуты с явными `<label>`.

#### 8. Производительность и наблюдаемость клиента

Бюджеты: LCP каталога < 2.5 s (RSC-рендер публичных списков, `next/image`, `next/font` swap);
TTI авторизованных роутов < 3 s; code-splitting по route groups (пациент/врач/админ не грузят код
друг друга). NFR-005 (< 500 ms сервер) + клиентский кэш §5.1 = отзывчивый подбор слота. Сетевые
ошибки → ретрай с экспонентой только для идемпотентных GET; `requestId` из problem+json выводится в
`ProblemBanner` и странице 500 (поддержка по логам pino, API §1).

#### 9. Структура `apps/web` и конвенции (GOLDEN-PRINCIPLES: kebab-case, без `any`)

```
apps/web/src/
  app/
    (public)/  (auth)/  (patient)/  (doctor)/  (admin)/     # route groups, layout.tsx в каждой
    api/auth/{authorize,callback,session,refresh,logout}/route.ts   # token broker (§2)
    layout.tsx  error.tsx  not-found.tsx
    middleware.ts
  components/
    ui/          # shadcn-примитивы
    layout/      # patient-shell, staff-shell, notification-bell, locale-switcher
    domain/      # slot-picker, booking-wizard, encounter-complete-form, icd10-combobox, …
    feedback/    # problem-banner, stamp-badge, code-chip, empty-state
  lib/
    api/         # api-fetch.ts, problem.ts, query-keys.ts
    auth/        # session-store.ts
    format/      # datetime.ts (Europe/Minsk)
  messages/      # ru.json, en.json
```

Компоненты ≤ 300 строк (§ Code Organization); формы — `use*Form`-хуки рядом с компонентом.

#### 10. Трассируемость FR → страницы/компоненты

| FR     | UI                                                                      | API (§)                   |
| ------ | ----------------------------------------------------------------------- | -------------------------- |
| FR-001 | `/login`, `/register`, token broker, session store                  | 2.1.2–2.1.4, 2.2.6–2.2.7 |
| FR-002 | `/`, `/doctors`, `/doctors/[id]`                                  | 4.1–4.2, 5.1.1–5.1.2     |
| FR-003 | `BookingWizard` шаг 3, `SlotPicker`                              | 5.2.8                      |
| FR-004 | `BookingWizard` шаг 4                                              | 6.1                        |
| FR-005 | `CancelAppointmentDialog`                                             | 6.4                        |
| FR-006 | `/appointments`, `/appointments/[id]`, `/history`                 | 6.2–6.3, 7.6              |
| FR-007 | `/prescriptions`                                                      | 7.7                        |
| FR-008 | `NotificationBell`, `/notifications`                                | 8.1–8.3                   |
| FR-009 | `/doctor/appointments`, `/doctor/schedule`                          | 5.2.7, 6.5                 |
| FR-010 | `/patients/[id]`                                                      | 3.2–3.3, 7.4              |
| FR-011 | «Открыть приём»,`/encounters/[id]`                      | 7.1–7.3                   |
| FR-012 | `Icd10Combobox` в `EncounterCompleteForm`                          | 7.3                        |
| FR-013 | секция «Рекомендации»                               | 7.3                        |
| FR-014 | секции назначений (`AtcCodeField`, `NsiCodedField`) | 7.3                        |
| FR-015 | `/admin/users`                                                        | 2.2.1–2.2.5               |
| FR-016 | `/admin/services`                                                     | 5.1.3–5.1.5               |
| FR-017 | `/admin/rooms`                                                        | 4.3–4.7                   |
| FR-018 | `/admin/terminology`                                                  | 2.3.1–2.3.4               |
| FR-019 | `/admin/analytics`                                                    | 9.1–9.3                   |
| FR-020 | `/admin/schedules`                                                    | 5.2.1–5.2.6               |
| FR-021 | `/admin/audit`                                                        | 9.4                        |

**Coverage:** 21/21 FR; все 9 BR выражены в UX: BR-001 → `SlotPicker`+409; BR-002 → cancel/noshow-действия;
BR-003 → complete только в своем приёме; BR-004 (диагноз в контексте приёма), BR-005 (назначения
ссылаются на Condition и Encounter), BR-009 (АТХ/UCUM) → валидаторы `EncounterCompleteForm`;
BR-006 → `/me/*`-роуты без выбора пациента; BR-007 → admin-раздел; BR-008 → «Открыть приём» только
для `booked`.

**Допущение UI-1 (для writing-plans):** форма логина — у `auth-service` внутри authorize-flow
(API §2.1.2 «сессия логина»); если потребуется логин внутри Next-клиента — нужен новый эндпоинт
`POST /api/v1/auth/login` (изменение API-спеки, вне объёма TASK-001).

---

### [TASK-001] Frontend polish iteration — визуальные спеки состояний и страниц (2026-10-05)

**Источники:** `specs/frontend-design-spec.md` (§0–§10 TASK-001 от 2026-10-04),
`specs/api-designer-spec.md` (каталог 16 errorCode, §1), `tasks/TASK-001/writing-plans-plan.md`
(M6 — 5 route groups, errorCode→UX 16/16). **Характер изменения:** дополнение, не редизайн —
направление «Медицинская карта» (§0: `#FAF9F6` + `#1C2B33` + `#0F766E`, PT Serif / Inter /
JetBrains Mono, радиус 6px, без теней) подтверждается; ниже — визуальные спеки состояний,
страниц и print-режима для прямой реализации в `coder-frontend`.

#### A. Направление и дифференциация (подтверждение)

Направление — **Editorial / Medical-ledger**: журнальная иерархия PT Serif + волосяные линии
`#E5E2D9` вместо теней. Избегаем generic-AI эстетики: нет фиолетовых градиентов,
glassmorphism, emoji-иконок, pill-кнопок «везде». Запоминающийся элемент — **статусы-штампы
`StampBadge`** (uppercase, tracking +0.08em, рамка 1.5px, прозрачный фон) плюс монотипные
**`CodeChip`** для МКБ-10/АТХ/UCUM — интерфейс как страница медкарты, а не SaaS-дашборд.

#### B. Токены — дополнения к §0 (без ломающих изменений)

- Focus: `outline: 2px solid var(--ring)` (`#0F766E`), `outline-offset: 2px` — на всех
  интерактивных элементах (WCAG 2.1 AA, §7).
- Skeleton: фон `#F1EFE9`, шиммер 1200 мс едва заметный; при `prefers-reduced-motion` — статика.
- Print: `@media print` — белый фон, чёрный текст, скрыть шапку/сайдбар/тосты; `StampBadge`
  печатается рамкой; «История»/«Детали приёма» — печатная выписка.
- Плотность: пациент — comfortable (touch-target ≥ 44px); врач/админ — compact (строки h-11,
  sticky header, hover `#F7F5EF`, без зебры).

<!-- POLISH-PART-2 -->

#### C. Визуальные спеки ключевых страниц (состояния: default/loading/пусто/ошибка)

1. **`(public)` `/`, `/doctors`, `/doctors/[doctorId]` (RSC, FR-002).** Хиро — PT Serif 32px,
   подзаголовок Inter 16px `#5B6770`; поиск (специальность + услуга + дата) — одна строка на
   десктопе, стек на `<768px`. Карточки врачей: аватар-инициалы на `#F1EFE9`, имя Serif 20px,
   специальность + `CodeChip` услуг. Loading: 6 skeleton-карточек. Пусто: `EmptyState`
   «Врачи не найдены — измените фильтры». Ошибка сети: `ProblemBanner` + retry.
2. **`(patient)` `BookingWizard` (4 шага, FR-003/FR-004, BR-001).** Шаги — нумерованные
   волосяные (1 Услуга · 2 Врач · 3 Время · 4 Подтверждение), текущий — primary-рамка.
   `SlotPicker`: плитки по дням, время JetBrains Mono 14px; `free` — bordered, hover `#F1EFE9`;
   `busy` — зачёркнут, `aria-disabled`; выбранный — заливка `#0F766E`, текст `#ECFDF5`.
   staleTime 15 s + `refetchOnWindowFocus`. Конфликт 409 `SLOT_CONFLICT`: тост `aria-live`
   «Слот только что заняли», авто-refresh, занятый слот — destructive-рамка 1.5px, мастер
   остаётся на шаге 3. Черновик — sessionStorage (§5.2).
3. **`(patient)` `/appointments`, `/history`, `/prescriptions` (FR-006/FR-007).**
   `AppointmentCard`: дата Serif 20px + `StampBadge` справа; cancel — только владелец (BR-002)
   через `CancelAppointmentDialog` (reason 3…500, zod). `PatientHistoryTimeline`: волосяная
   линия, точки primary; запись — дата + диагноз-`CodeChip`. `PrescriptionCard`: код АТХ mono
   + dosageText + примечание; печать — print-режим.

<!-- POLISH-PART-3 -->

4. **`(doctor)` `/doctor/appointments` + `/encounters/[encounterId]` (FR-009/011–014).**
   Журнал дня — compact-таблица (09:00 mono, пациент, `StampBadge`, «Открыть приём» только для
   `booked`, BR-008). `EncounterCompleteForm` — 4 секции-филдсета (summary+diagnoses /
   observations / назначения / recommendations), один атомарный submit `CompleteEncounterDto`
   (API 7.3). После `finished` — read-only + баннер «Приём завершён» (BR-003). `Icd10Combobox`:
   `$expand` ValueSet `https://fhir.by/ValueSet/InternClassificDiseases10` + маска кода;
   офлайн-фолбэк — ручной ввод + `GET /terminology/validate`. UCUM — только селект (BR-009),
   АТХ — mono-поле + маска + validate 2.3.3. Повторный complete → 409 → read-only (C2).
5. **`(admin)` `/admin/*` (FR-015–021, BR-007).** Паттерн: `PaginatedTable` (серверная
   пагинация `PageMetaDto`, sortBy/sortOrder) + фильтры сверху + primary CTA справа.
   `ScheduleEditor`: окна MO–SU, horizon ≤ 90 дней, превью пересечений; `SCHEDULE_OVERLAP` —
   подсветка окон + `ProblemBanner`. `SlotGenerationDialog`: from/to в горизонте,
   `Idempotency-Key`, результат `{ generated, skipped }`. `RoomUsageDrawer`: удаление
   блокируется при активных расписаниях (`ROOM_IN_USE`). `TerminologyImportPanel`:
   202 Accepted («импорт выполняется»), 409 → «уже выполняется». `AnalyticsDashboard`:
   KPI-карты Serif-цифры + recharts, фильтр ≤ 366 дней. `AuditTable`: occurredAt + userId +
   action + resourceType/Id + `requestId` mono с копированием.
6. **`(auth)` `/login`, `/register` + broker (FR-001).** Карточка `#FFFFFF`, рамка `#E5E2D9`,
   радиус 8px, max-w 400px по центру. 401/403 → `ProblemBanner` без раскрытия причины.
   Редирект по роли: PATIENT → `/booking`, DOCTOR → `/doctor/appointments`,
   ADMIN → `/admin/analytics`.

#### D. Состояния, motion, responsive (дополнение к §5.4/§7/§8)

- `ProblemBanner`: title + detail + `CodeChip errorCode` + `requestId` mono с копированием;
  401 → silent refresh, повторный 401 → `/login?returnTo=…`; 429 → «повторите через N с»;
  5xx → страница 500 с `requestId`. `ForbiddenState` (403), `NotFoundState` (404),
  `EmptyState` с CTA, skeleton-набор для таблиц/карточек/таймлайна.
- Motion: 150 мс ease-out hover/focus; баннеры — fade+slide 8px; шиммер 1200 мс;
  `prefers-reduced-motion: reduce` — статика. Без параллаксов — инструмент клиники.
- Responsive: `≥1280px` — StaffShell (сайдбар 240px); `1024–1279px` — сайдбар 72px;
  `768–1023px` — верхняя навигация + табы; `<768px` — карточки вместо таблиц, мастер — один
  шаг на экран + sticky CTA, `SlotPicker` — вертикальный список. `PaginatedTable` имеет
  `cardView` < 768px (тот же `StampBadge`, та же семантика).

#### E. Трассируемость дополнения

Покрытие FR — 21/21 (§10, без изменений); дополнение закрывает визуальные пробелы для M6
writing-plans (задачи 16–19): loading/empty/error каждого экрана, 409-ветка бронирования,
read-only завершённого приёма, print-выписка, responsive-правила. Все 16 errorCode уже имеют
UX в §5.4 — здесь добавлены тексты и фокус-поведение.

---

### [REDESIGN] Спокойная клиника — токены, шрифты, примитивы, главная (2026-10-22)

**Ветка:** `feature/frontend-redesign`. **Источник дизайна:** холст Claude Design (доски `Tokens`, `MainB`, `Booking`,
`Appointments`, `DoctorJournal`, `AdminAnalyticsC`); хэндофф — `frontend/coder-frontend-redesign-handoff.md`.
**Статус:** фундамент и главная реализованы; остальные области переносятся отдельными сессиями.

**Что заменяет.** Визуальное направление «Медицинская карта» (§0 первой записи TASK-001: тёплая бумага, PT Serif,
волосяные линии вместо теней, радиус 6 px) — кроме правил доступности, которые остаются в силе (контраст, цели 44 px,
`aria-*`, skip-link, `prefers-reduced-motion`, печать).

**Направление.** «Спокойная клиника»: холодный светлый фон, бирюзовый акцент, мягкие плитки статусов, без градиентов
и эмодзи; запись на приём — один из способов войти, а не центр сайта (клиника как организация: направления, путь
пациента, компании и страховые, команда, контакты).

**Токены** (`src/styles/globals.css`, контраст проверяет `globals-contrast.spec.ts` в обеих темах):

| Токен | Светлая | Тёмная | Назначение |
|---|---|---|---|
| `--background` / `--card` / `--secondary` | `#f5f7f7` / `#ffffff` / `#edf2f2` | `#0d181b` / `#142328` / `#1b2e33` | фон, поверхность, нейтральная плитка |
| `--foreground` / `--muted-foreground` | `#13252b` / `#4c5f66` | `#e4eced` / `#9db0b4` | текст |
| `--primary` / `--primary-foreground` | `#0f766e` / `#ffffff` | `#34b3a5` / `#04211e` | акцент, кнопка |
| `--primary-soft` / `-foreground` | `#e2f1ee` / `#0b5a53` | `#123b37` / `#8fddd3` | мягкая плитка, активный пункт меню |
| `--destructive` `--warning` `--success` (+ `-soft`) | `#b3261e` `#9a4a06` `#2f6b4f` | `#f28b82` `#f0a35e` `#7fc9a1` | статусы |
| `--border` / `--input` | `#dce4e5` / `#7a8a8f` | `#25393e` / `#6e868b` | линия карточки, рамка поля (≥ 3:1) |
| `--inverse*` | `#13252b` полоса | `#1b2e33` | тёмная полоса на светлой странице |

Радиусы: `rounded-control` 10 px (поля, кнопки), `rounded-card` 16 px, `rounded-panel` 20 px.
Тёмная тема включается атрибутом `data-theme="dark"` на `<html>`; привязки к `prefers-color-scheme` и переключателя в
шапке пока нет (экраны ещё не проверены на тёмном фоне).

**Шрифты.** Onest (интерфейс и заголовки, кириллица) и JetBrains Mono (время, длительность, коды) — самохостинг через
`@fontsource-variable/onest` и `@fontsource-variable/jetbrains-mono`, подключены в `app/layout.tsx`; сеть при сборке не нужна.

**Примитивы** (`src/components/ui/`): `Button` + `buttonVariants` (`primary` `secondary` `soft` `danger` `ghost`
`inverse`; размеры `md` 44 px и `lg` 52 px; применимы и к `Link`), `Card` (`radius` card|panel, `padding`, `as`),
`cn()` в `src/lib/ui/cn.ts`.

#### [REDESIGN] Главная `/` (HomeView)

Секции сверху вниз: **Hero** (заголовок «Консультация, диагностика и наблюдение — в одном центре», кнопки «Выбрать
направление» и «Записаться на приём», декоративная иллюстрация и карточка «Электронная медкарта») → **доверие**
(лицензия, диагностика на месте, медкарта, работа с компаниями) → **Направления** (5 карточек; ниже живой каталог
услуг с длительностью, каждая ведёт к врачам) → **путь пациента** (4 шага, запись — первый) → **Кому мы помогаем**
(тёмная полоса: частные пациенты, компании, страховка; «Нам доверяют» — компании и страховые) → **врачи** (живые
данные, первые 4) → **«Пациенту на заметку» и контакты**. Якоря шапки: `#directions`, `#companies`, `#contacts`.

- Живые данные — только услуги и врачи (как раньше); при сбое каталога баннер заменяет услуги, статические секции остаются.
- Статический контент — `src/components/catalog/home-content.ts`. **Это демонстрационные данные** (лицензия, реквизиты,
  контакты на домене `*.example`, названия компаний и страховщиков, без логотипов); страница сообщает об этом
  (`home.demoNote` под списком компаний и в подвале). Перед публикацией заменить фактами клиники.
- Шапка и подвал публичных страниц — `PublicShell` и `PublicFooter`: логотип-плитка, якорная навигация, телефон,
  вход/личный кабинет, переключатель языка; на главной `<main>` без собственной ширины (полноширинные полосы).
- Разделы «Компаниям» и «По страховке» — блоки с якорем и `mailto:`; отдельных страниц нет.

**Состояния и доступность.** Заголовки `h1` → `h2` → `h3` по секциям; секции — `region` с именем; ссылки-кнопки ≥ 44 px;
иллюстрация `aria-hidden`; названия компаний только текстом.

#### [REDESIGN] Остальные области (2026-10-22)

Перенесены сессиями по холсту; ветки влиты в `feature/frontend-redesign`. Общие правила — токены и примитивы из раздела выше,
статусы не только цветом, цели 44 px, `aria-expanded`/`aria-pressed`/`aria-current` сохранены.

- **Кабинет пациента** (`components/layout/patient-shell.tsx`): логотип-плитка, навигация «пилюлями» (активный пункт на
  `primary-soft`), колокольчик со счётчиком, ширина контента 1200 px. **Запись** `/booking`: четыре полосы-шага с номерами,
  карточки услуг с радио/галочкой, пунктирная «Не знаю, какая услуга», панель «Ваша запись» из черновика без новых запросов;
  выбор услуги по-прежнему сразу ведёт на шаг 2 (кнопки «Далее» нет, логика `booking-steps.ts` не менялась).
  **Мои записи**: карточка ближайшего приёма, список по дням, мягкие бейджи статусов.
- **Профиль** `/profile` (`components/patient/profile/*`): шапка с кольцом полноты (4 равных пункта: дата рождения, пол,
  телефон, e-mail), быстрые действия, «Рекомендации для вас», ближайший и последний приём, «Мои врачи» (только врачи
  предстоящих записей), личные данные и документы. Правила рекомендаций — чистые функции со спеками; пороги клиники
  (40 лет, 365 и 60 дней) — константы в начале `profile-recommendations.ts`. Скрытые рекомендации хранятся в `localStorage`
  по id пациента. Редактирование данных, телефон, каналы уведомлений и ДМС **не реализуются**: нет бэкенда, UI
  показывает указание обратиться в регистратуру. Согласие на ЭМК — см. раздел «[ADR-019] Согласие на ЭМК» ниже.
- **История, назначения, уведомления**: сводка и раскрывающиеся приёмы; назначения по приёмам со вкладками статусов;
  уведомления по дням с фильтрами. Итоги считаются по загруженной странице и подписаны «на этой странице», общий счётчик
  берётся из ответа. «Отметить прочитанными на странице» отмечает только текущую страницу (API отмечает по одному);
  у уведомлений о записи нет ссылки на запись, пока в данных нет её id.
- **Врач** (`components/layout/staff-shell.tsx`, `components/doctor/*`): боковая панель с подписью роли (она же у админа);
  журнал `/doctor/appointments` с переключателем День / Неделя: таймлайн дня с панелью следующего пациента и итогами,
  неделя — сетка из пяти рабочих дней (пять параллельных запросов по одному на день, ключ запроса общий с дневным видом).
  «Прошлые визиты» и «Последний диагноз» не показываются: в API их нет.
- **Администрирование**: `/admin/analytics` — отчёт с выводами, все цифры и фразы вычисляются из ответа (карточка не
  показывается без данных); таблицы с итогами, безымянные группы сведены в одну строку, идентификаторы под `<details>`.
- **Вход и служебные страницы**: карточка `rounded-panel` по центру, плитки 404/403/ошибка.
- **Известный долг:** `CodeChip` в `components/feedback` и часть общих компонентов ещё содержат жёсткие цвета; тёмная
  тема включается только атрибутом `data-theme="dark"`.

### [ADR-019] Согласие на электронную медкарту — клиент (2026-10-23)

Контракт эндпоинтов — `api-designer-spec.md` §3.4–3.11, §7.1/7.3, §6.1; здесь только экраны. Код — `components/consent/*`,
тексты — `messages/*.json` `consent.*`, ключи кэша — `queryKeys.myConsent` / `patientConsent(id)` под корнем `consent`
(одна инвалидация `consent-change` после любой записи).

- **Регистрация** `/register`: обязательная галочка согласия на обработку данных учётной записи (ст. 5 Закона 99-З), версия
  текста `ACCOUNT_CONSENT_VERSION` в `lib/contracts.ts`; отправляется `accountConsent {accepted, textVersion}`, ошибки
  `accountConsent.*` ложатся на галочку. Рядом строка: согласие на медкарту оформляется письменно в клинике.
- **Кабинет пациента** `/profile`: `MyConsentSection` (3.4, 3.6): статус, история, как оформить в регистратуре, отзыв через
  диалог (новые записи прекращаются, существующие не удаляются, нужно письменное заявление). Скан пациент не читает.
- **Врач** `/patients/[patientId]`: `PatientConsentBanner` (предупреждение, если 3.7 без действующего согласия) и
  `StaffConsentPanel` (статус, история, скачивание скана 3.11 с токеном, форма 3.10+3.8, отзыв 3.9). Приём: 409 `CONSENT_REQUIRED`
  на 7.1 — диалог в журнале, на 7.3 — блок под формой завершения (вне `<form>`), оба с «Экстренная помощь».
- **Админ**: ссылка «Согласие на ЭМК» в строке пользователя с `patientRef` ведёт на `/admin/patients/[patientId]/consent`;
  страница читает только 3.7/3.3, медицинских данных не запрашивает; ФИО оформившего вводит администратор (у врача — с сервера).
- **Запись** 6.1: при известном «нет согласия» поле причины заблокировано с подсказкой, черновик причины очищается.
