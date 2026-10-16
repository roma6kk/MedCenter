# coder-frontend: CORE (общий слой клиента) — отчёт

Ветка `feature/clinic-platform-wip`, клиент `frontend/` (Next.js 15; отклонение от `apps/web` принято). Это возобновлённый запуск: прошлый прогон оборвался по сетевой ошибке, когда CORE уже изменил `app/api/auth`, `lib/api`, `lib/auth`, `contracts`, layout/feedback-компоненты и messages. Я осмотрел `git status` и `git diff`, сохранил всё корректное и довёл начатое. Заново ничего не делал и не дублировал.

## 1. Итог

| Пункт задания | Статус |
| --- | --- |
| (1) Вход в браузере: публичный origin для `redirect_uri` и пост-логин редиректов | Готово. Проверено в реальном Chrome на живом стеке (15/15 e2e). |
| (2) Общий API-слой: `PaginatedResponse<T>`, разбор RFC 7807 с `details[]`, ключи запросов | Готово. |
| (3) `notification-bell` на реальных эндпоинтах, опрос 30 с (ADR-015) | Готово. Формы ответов и интервал проверены вживую. |
| (4) `error-code-map` покрывает все 20 кодов `libs/contracts` | Готово. Паритет списков проверен. |
| (5) middleware и role guard с реальными токенами | Готово. Роль берётся из сессии, проверено e2e для трёх ролей. |

Проверки (`cd frontend`): `npx tsc --noEmit` — 0 ошибок; `npx jest` — 64 набора, 685 тестов, все зелёные; `npx next lint` — без предупреждений и ошибок. `next build` не запускался (dev-сервер использует тот же `.next`).

## 2. (1) Token broker и публичный origin

Корневая причина: `/api/auth/authorize` и `/callback` строили `redirect_uri` из `request.nextUrl.origin`. В standalone-контейнере это `http://0.0.0.0:3000`, а в реестре auth-service зарегистрирован `http://localhost:3000/api/auth/callback`. Результат — 400 «redirect_uri is not registered».

Что сделано:
- `lib/auth/auth-config.ts` (новый): `resolvePublicOrigin()` берёт `APP_PUBLIC_URL`, затем `NEXT_PUBLIC_APP_URL`, по умолчанию `http://localhost:3000`. Значение валидируется (только http/https), путь и хвостовой `/` отбрасываются. Остальное: `publicUrl(path)`, `resolveRedirectUri()`, `resolveAuthBackendUrl()` (по умолчанию `http://medcenter.localhost:8081` вместо внутреннего `auth-service:3000`), `resolveOauthClientId()`, `isSecureOrigin()`.
- `authorize/route.ts`, `callback/route.ts` и `middleware.ts` теперь используют только публичный origin: для `redirect_uri`, для обмена кода, для редиректов после входа, на `/login?error=access_denied` и для редиректа гостя на `/login?returnTo=…`.
- `Secure` у cookie зависит от схемы публичного origin. На `http://localhost` cookie с `Secure` часть браузеров молча отбрасывает, и вход бы ломался.
- Из scope убран `offline_access`: клиенту он не выдаётся, auth-service молча его отбрасывал.
- Сохранены: denylist `returnTo` (`sanitizeReturnTo`) и PKCE fail-closed (`callback-flow.ts`). Любое отсутствие или несовпадение `code`, cookie или `state` отклоняет callback до обращения к auth-service. `parseTokenSet` не даёт записать в cookie строку `"undefined"`.
- Разбор на модули: `callback-flow.ts`, `pkce.ts`, `token-response.ts`, `session-broker.ts`, `session-cookies.ts`, `session-response.ts`, `user-role.ts`.

Cookie брокера:
- `mc_pkce` — verifier и state, 10 минут.
- `mc_rt` — refresh-токен, httpOnly, 14 дней, путь `/api/auth`: страницы и `/api/v1` его не получают.
- `mc_at` — кэш access-токена, 15 минут, путь `/api/auth`. Нужен, потому что токен-эндпоинт ограничен 20 запросами в минуту на весь веб-сервер.
- `mc_session` — маркер для edge-middleware.

Поведение:
- **Session и refresh:** `/api/auth/session` отвечает из ещё действительного `mc_at`, иначе ротирует refresh-токен. `/api/auth/refresh` всегда ротирует. Ротированная пара сохраняется обратно в cookie, потому что токен одноразовый.
- **Параллельные запросы с одним cookie:** StrictMode и несколько вкладок делят результат ротации в окне 10 с. Проигравший гонку не разлогинивается.
- **Logout:** отзывает refresh-токен с Bearer владельца. Сбой отзыва не блокирует выход.
- **Ошибки session:** `unavailable` даёт 503 и не стирает cookie; `invalid` стирает их.

Тесты: `auth-config`, `authorize/route`, `callback/route`, `refresh/route`, `session/route`, `logout/route`, `session-broker`, `session-cookies`, `callback-flow`, `pkce`, `token-response`, `user-role`, `return-to`, `middleware`. Среди них прямой случай «запрос пришёл на bind-адрес `0.0.0.0`, а `redirect_uri` и редирект остаются на публичном origin».

### Проверка в реальном браузере (живой стек)

Использован установленный Google Chrome (в системе нет скачанных браузеров Playwright), демо-аккаунты читаются из манифеста во время выполнения и нигде не печатаются.

- `e2e/auth-login.spec.ts` (новый, 15 тестов, все зелёные): гость → `/login?returnTo=…`; вход пациента через форму auth-service, приземление на `/booking` на публичном origin; `mc_rt` httpOnly и не виден в `document.cookie`; три перезагрузки подряд не разлогинивают; бейдж колокольчика; `/admin/users` у пациента ведёт на `/403`; `returnTo=/appointments` возвращает на нужную страницу; ротация refresh-токена после удаления `mc_at` (новое значение `mc_rt` отличается от старого); выход стирает cookie и снова защищает маршруты; врач и админ приземляются на свои страницы, колокольчика у них нет, чужая группа даёт `/403`.
- Разовая проверка (временный spec удалён): запрос `unread-count` с испорченным Bearer получил 401, затем отработал `POST /api/auth/refresh` (200) и повтор запроса вернул 200. Последовательность в логе: `session 200 → unread-count 401 → refresh 200 → unread-count 200`.
- Скриншоты оболочек пациента, врача и админа (1280 и 390 px) просмотрены: шапка, навигация, переключатель языка и выход отображаются корректно, `aria-current` на текущем пункте виден.

## 3. (2) Общий API-слой

- `lib/api/pagination.ts`: `PaginatedResponse<T>` = `{ items, meta: { page, pageSize, totalItems, totalPages } }` (совпадает с `PageMetaDto` в libs и с живым ответом), `PageParams`, `isPaginatedResponse`, `toPaginated` (оборачивает голый массив старых списков), `emptyPage`, `pageLabel`.
- `lib/api/problem-parse.ts` и `problem.ts`: разбор problem+json с `details[] {field, message}`, `requestId` (тело либо заголовок `X-Request-Id`), `Retry-After` (секунды или HTTP-дата). Ответ, который не problem+json (HTML 502 от Traefik, 404 Next, пустое тело, сетевой сбой), превращается в `ProblemDetails` по статусу и не роняет интерфейс.
- `lib/api/field-errors.ts`: `groupFieldErrors`, `applyProblemToForm(problem, setError, knownFields)` (ставит ошибки react-hook-form на поля, возвращает серверные поля, которых нет в форме, чтобы показать их баннером), `localizeFieldMessage` (русские тексты для сообщений class-validator), `hasDetailCode` (для `EMAIL_TAKEN` внутри `detail` у 409 CONFLICT).
- `lib/api/query-keys.ts`: конвенция `[domain, ...identity, params]` из §5.1, параметры нормализуются. `queryRoots` — префиксы для инвалидации. `lib/api/invalidation.ts`: таблица «мутация → ключи» из §5.1 (`invalidateFor(client, 'booking' | 'cancel-appointment' | 'noshow' | 'open-encounter' | 'complete-encounter' | 'read-notification' | 'admin-*' | 'generate-slots' | 'terminology-import')`). `lib/api/query-config.ts`: staleTime по §5.1 (каталог 5 мин, слоты 15 с, записи 30 с, терминология 1 ч).
- `lib/api/query-client.ts`: единый `QueryClient`. Повторы только для идемпотентных чтений при сети, 502, 503 и 504, с экспонентой; мутации никогда не повторяются. Центральные побочные эффекты кодов (`error-effects.ts`): тост «слишком много запросов» с `Retry-After`, тост и рефетч слотов при `SLOT_CONFLICT`, рефетч записи при `APPOINTMENT_NOT_CANCELLABLE`, рефетч приёма при `ENCOUNTER_STATE_INVALID`, тост при потере связи.
- `lib/api/api-fetch.ts`: Bearer из памяти; `Content-Type` только при наличии тела; 401 → единственный общий refresh и один повтор; `TOKEN_REVOKED` завершает сессию и оставляет flash «Сессия завершена, войдите снова»; `ApiError` несёт `problem`.
- Тосты: `store/use-toast-store.ts`, `lib/ui/toast.ts` (вызов вне React), `lib/ui/flash-message.ts` (передача сообщения между полными перезагрузками), `components/feedback/toaster.tsx` (две live-области: `status` вежливая и `alert` настойчивая, автозакрытие, кнопка «Закрыть»).
- i18n без провайдера: `lib/i18n/translate.ts`, `use-t.ts`, `locale.ts`. Каталоги `messages/ru.json` и `en.json` — по 101 ключу, паритет проверяется тестом `translate.spec.ts`.

## 4. (3) Уведомления

`lib/notifications/notification-api.ts` и `use-notifications.ts`, `components/layout/notification-bell.tsx`:
- `GET /api/v1/notifications/unread-count` → `{count}`;
- `GET /api/v1/notifications` → `{items, meta}`, элемент `{id, category, text, sent, read}`; параметр `unread` отправляется только как `true`;
- `POST /api/v1/notifications/{id}/read` → 204, затем инвалидируются список и счётчик.

Опрос — `refetchInterval` 30 с, `refetchIntervalInBackground: false`, рефетч при фокусе окна. Хуки включены только для роли `PATIENT` после гидратации: врачи и админы не шлют запросов (сервис ответил бы им 403), и колокольчик для них не рендерится. У ссылки есть `aria-label` со счётчиком (`Уведомления, непрочитанных: N`), бейдж с «99+», невидимая live-область `role="status"`, мишень не меньше 44×44.

Вживую проверено под реальным пациентом: ключи ответов `unread-count` → `["count"]`, список → `["items","meta"]`, `meta` → `page, pageSize, totalItems, totalPages`, элемент → `id, category, text, sent, read`; `POST …/read` → 204, счётчик 50 → 49; в окне 65 с зафиксированы запросы `unread-count` с интервалом 30 с. Побочный эффект проверки: у демо-пациента №3 одно уведомление помечено прочитанным (счётчик 49).

## 5. (4) Карта кодов ошибок

- `lib/api/problem.ts`: `ERROR_CODES` = 20 кодов, добавлены `SCHEDULE_IN_USE`, `ROOM_IN_USE`, `SERVICE_IN_USE`. Список остаётся «одна строка на код», потому что бэкенд-спек `error-code.frontend-parity.spec.ts` разбирает его регуляркой.
- `lib/api/error-code-map.ts`: `Record<ErrorCode, ErrorUx>`, поэтому новый или пропущенный код — ошибка компиляции. `COMPARTMENT_VIOLATION` → `not-found` (BR-006; бэкенд отвечает 403, UI показывает как 404). `SLOT_CONFLICT` → `slot-conflict` (рефетч слотов, тост «Слот уже занят», шаг мастера сохраняется). Три `*_IN_USE` → `in-use-conflict` с типом ресурса. Неизвестный будущий код деградирует до общего баннера.
- `messages/{ru,en}.json`: `errors.<КОД>` для всех 20 кодов, плюс `errors.RATE_LIMITED_RETRY` и `errors.NETWORK`.
- Сверка списков через diff с `libs/contracts/src/lib/error-code.ts`: расхождений нет.

## 6. (5) Middleware и role guard

- `middleware.ts`: гость на защищённом пути получает редирект на публичный origin `/login?returnTo=<path+query>`; matcher не трогает `api/auth`, статику и favicon; сквозной редирект проходит `shouldRedirectToLogin`.
- Роль приходит из токена (`role` в JWT) через `/api/auth/session` в `useSessionStore`. `RoleGuard` не монтирует детей, пока доступ не решён (чужая роль не шлёт запросов своей группы) и ведёт на `/403` или `/login?returnTo=…`. `resolvePostLoginPath` не отправляет пользователя на страницу чужой роли.
- Оболочки: `NavLink` с `aria-current="page"`, `LogoutButton` (блокировка на время выхода), `skip-link`, колокольчик только в `patient-shell`; `staff-shell` подписывает навигацию по роли.
- Компоненты data-display и feedback: `PaginatedTable` (серверная пагинация по `meta`, сортировка с `aria-sort`, карточки на мобильных, `nav` с `aria-live`), `ProblemBanner` (заголовок по `errors.<код>`, `Retry-After`, копирование `requestId`), `StampBadge` (в том числе `entered-in-error`), состояния `Forbidden/NotFound/Empty/TableSkeleton`.
- Из mismatch-списка закрыто в CORE: правило пароля в `contracts.ts` теперь зеркалит серверный `IsStrongPassword` (спецсимвол — только из ASCII-набора; кириллица символом не считается).

## 7. Файлы

Изменённые и новые файлы (без spec): `src/app/api/auth/{authorize,callback,logout,refresh,session}/route.ts`, `src/components/{providers.tsx,data-display/paginated-table.tsx,feedback/{problem-banner,stamp-badge,states,toaster}.tsx,layout/{locale-switcher,notification-bell,patient-shell,staff-shell,logout-button,nav-link}.tsx}`, `src/lib/api/*` (api-fetch, error-code-map, error-effects, field-errors, invalidation, pagination, problem, problem-parse, query-client, query-config, query-keys, query-string), `src/lib/auth/*` (auth-config, callback-flow, jwt-fixture, pkce, return-to, role-access, session-broker, session-client, session-cookies, session-response, token-response, user-role), `src/lib/contracts.ts`, `src/lib/i18n/*`, `src/lib/notifications/*`, `src/lib/ui/*`, `src/messages/{ru,en}.json`, `src/middleware.ts`, `src/store/{use-session-store,use-ui-store,use-toast-store}.ts`, `e2e/fixtures/{auth,demo-accounts}.ts`, `e2e/auth-login.spec.ts`, `pw-tmp.config.ts`. Плюс 39 spec-файлов рядом с кодом. Все файлы короче 300 строк, `any` и `!` не используются.

`frontend/pw-tmp.config.ts` — локальный, неотслеживаемый конфиг Playwright для установленного Chrome (в системе нет скачанных браузеров Playwright): `npx playwright test auth-login.spec.ts --config pw-tmp.config.ts`. Я заменил абсолютный путь вывода на относительный `./test-results/pw` (папка уже в `.gitignore`). В коммит его включать не нужно.

Фикстура `e2e/fixtures/demo-accounts.ts` читает пароли из `tools/demo-seed/output/demo-manifest.json` во время выполнения и прячет их за методом: `toJSON` пароль не отдаёт, поэтому `console.log(account)` и вложения трассировки его не раскроют.

## 8. Что должны исправить area-агенты (маршруты и компоненты областей)

Область ещё не тронута: `git status` показывает изменения только в файлах CORE.

Общие правила для всех: ключи сообщений добавлять только в свои пространства имён (`doctor.*`, `admin.*`, `patient.*`, …) и после правки прогнать `src/lib/i18n/translate.spec.ts` (паритет ru/en); список и пагинацию брать из `lib/api/pagination.ts`; ключи запросов — из `queryKeys`, инвалидацию — через `invalidateFor`.

Группы маршрутов:
- `app/(auth)/layout.tsx` и `app/(public)/layout.tsx` не оборачивают детей в `<Providers>`. Поэтому на `/login` не показывается тост «Сессия завершена, войдите снова» (flash после `TOKEN_REVOKED`), и нет `Toaster`. Нужен `Providers` (либо `Toaster`) в этих layout.
- `app/(auth)/login/page.tsx` не показывает `?error=access_denied`, который теперь возвращает callback.
- `app/(auth)/register/page.tsx`: использовать `applyProblemToForm` и `hasDetailCode(problem, 'EMAIL_TAKEN')` для подсказки у поля email; 409 `EMAIL_TAKEN` приходит как `CONFLICT` с кодом в `detail`.

Пути и формы, которых нет на бэкенде (из mismatch-списка):
- `components/booking/slot-picker.tsx`: `/api/v1/schedules/{id}/slots?status=free` → `GET /api/v1/doctors/{doctorId}/slots?from=&to=` (5.2.8); в мастере сейчас в скриншоте пациента виден «Не удалось загрузить слоты» с жёстко прописанным кодом `INTERNAL`: показывать `ProblemBanner problem={error.problem}`; добавить выбор даты; статус слота `free | busy | entered-in-error`.
- `app/(admin)/admin/rooms/page.tsx` → `GET /api/v1/rooms`; `app/(admin)/admin/services/page.tsx` → `GET /api/v1/services` (в 4.3 и 5.1.1 списки, бэкенд теперь отдаёт `{items, meta}`; `toPaginated` терпит голый массив).
- `app/(patient)/appointments/page.tsx` и `components/appointments/appointment-detail-view.tsx`: `/api/v1/me/appointments[/{id}]` → `/api/v1/appointments[/{id}]`; в `app/(patient)/notifications/page.tsx` вместо `/me/notifications*` использовать `useNotifications` и `useMarkNotificationRead` из `lib/notifications/use-notifications.ts`.
- `components/admin/schedule-editor.tsx`: тело `CreateScheduleDto` (`practitionerRoleId`, `roomId`, `serviceId`, `horizonFrom`, `horizonTo`, `windows[]`, `slotDurationMin`); `components/admin/slot-generation-dialog.tsx` и `app/(admin)/admin/schedules/page.tsx`: реальный id расписания и `{from, to}`; подсветка окон при `SCHEDULE_OVERLAP`; кнопки удаления кабинета, услуги и расписания обрабатывают `ROOM_IN_USE`, `SERVICE_IN_USE`, `SCHEDULE_IN_USE` (`in-use-conflict`).
- `components/admin/terminology-import-panel.tsx`: тело `{ snapshotVersion: '1.4.463' }`, обработка 400 и 409.
- `components/admin/audit-table.tsx`: добавить период `from`/`to` (по умолчанию сервис берёт 30 дней), `requestId` у событий encounter- и appointment-service пустой.
- `app/(doctor)/doctor/appointments/page.tsx`: `?date=` → `from=to=YYYY-MM-DD`, время из `start`, `patientName`; «Открыть приём» должен вызывать `POST /api/v1/encounters {appointmentId}` и вести на `/encounters/{response.id}`, а не на id записи (критично, сейчас 404); `components/doctor/encounter-view.tsx` читает `status`, `summary`, `recommendations`, `diagnoses[]`, `observations[]`, `serviceRequests[]`, `medicationRequests[]`.
- `app/(patient)/prescriptions/page.tsx`: ветвиться по `kind` (`service` без `atcCode` показывает пустой чип АТХ).
- Дашборд аналитики использует только плоские `booked/cancelled/noshow`; экранов 9.2 и 9.3 нет. Страница врача `/patients/[patientId]` не вызывает 3.1–3.3 (PatientHeader и RelatedPersons).

## 9. Замечания к бэкенду и инфраструктуре (без правок в `apps/`, `libs/`, `infra`)

- `libs/contracts/src/lib/error-code.frontend-parity.spec.ts`: пока клиентская копия содержала 17 кодов, два теста фиксировали «известный разрыв» (`it.failing` и «should miss exactly the three in-use codes…»). Теперь фронтенд знает все 20 кодов, поэтому эти два теста красные (запуск: `npx jest -c libs/contracts/jest.config.ts error-code.frontend-parity`). Как написано в самом тесте: убрать `.failing` у первого и удалить второй. Это правка в `libs/`, я её не делал.
- `docker-compose.yml` (сервис `web`) не задаёт `APP_PUBLIC_URL`. Сегодня это не мешает: значение по умолчанию `http://localhost:3000` совпадает с публикацией порта и зарегистрированным `redirect_uri`. Для любого другого хоста нужно добавить `APP_PUBLIC_URL` (рантайм) в environment.
- `POST /oauth/login` отвечает 429 и 503 страницей HTML с `Retry-After`, а не problem+json. Это форма браузера, клиентом не разбирается; для e2e это значит: каждый describe логинится один раз.
- Нарушений API-спека бэкендом, которые требовали бы правок на стороне сервера, не найдено: формы ответов уведомлений, `details[]`, конверты списков совпадают со спеком и с живым стеком.
