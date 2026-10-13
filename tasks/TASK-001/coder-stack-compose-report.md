# Контейнерный стек: 8 BFF + web (Docker Compose)

Дата: 2026-10-13. Ветка: `feature/clinic-platform-wip`. Скилл: `coder`.

> Раздел «Исправления по ревью» в конце отчёта отменяет противоречащие ему утверждения ниже
> (`env_file` у всех BFF, `guest:guest`, открытые порты, `/fhir` на edge, docker.sock у Traefik).

Прогон возобновлённый: предыдущая попытка была прервана лимитом. Перед работой проверено
состояние `docker-compose.yml`, `.dockerignore`, `infra/**`, `frontend/next.config.*` —
готовая часть сохранена, дублирования нет. Эта сессия добавила проверку, повторную сборку
и этот отчёт.

## Что сделано

NFR-001 (>= 6 контейнеров): 5 инфраструктурных (postgres, redis, rabbitmq, hapi, traefik)
+ 8 NestJS BFF + web = 14. Список из `docker compose config --services`:
postgres, hapi, rabbitmq, redis, auth-service, patient-service, practitioner-service, traefik,
web, appointment-service, catalog-service, notification-service, analytics-service,
encounter-service.

### 1. `infra/docker/nest-service.Dockerfile` (один на все BFF)

- Build-arg `APP` (имя Nx-проекта, обязателен: без него сборка падает на `test -n "$APP"`)
  и `PORT` (значение по умолчанию для `EXPOSE`/`ENV`; рабочее значение задаёт compose).
- Стадии: `base` (node:22-alpine + tini), `deps` (`npm ci --omit=dev --ignore-scripts`),
  `build` (полный `npm ci`, так как `nx` и `@nx/*` лежат в devDependencies; в контекст
  копируются `libs/` и только `apps/${APP}`; `npx nx build $APP --skip-nx-cache`),
  `runtime` (prod-зависимости + `dist/`, симлинки `node_modules/@medcenter/*` ->
  `dist/libs/*`, потому что `@nx/js:tsc` сохраняет спецификаторы `@medcenter/*`).
- `USER node`, `NODE_ENV=production`, `ENTRYPOINT tini`, команда
  `exec node dist/apps/$APP/src/main.js`: `exec` отдаёт PID 2 узлу, SIGTERM доходит до
  shutdown-хуков Nest.
- Общий кеш npm через `--mount=type=cache,sharing=locked`: стадии `deps` и `build`
  скачивают tarball один раз.
- Копируется только запрошенное приложение. Недописанный соседний сервис не может сломать
  сборку этого образа, а правки других приложений не инвалидируют слой.

### 2. `.dockerignore`

Белый список: `*`, затем `!package.json`, `!package-lock.json`, `!nx.json`,
`!tsconfig.base.json`, `!apps/`, `!libs/`. Внутри разрешённых каталогов дополнительно
исключены `**/node_modules`, `**/dist`, `**/.nx`, `**/.swc`, `**/coverage`,
`**/test-results`, `**/tmp`, `**/logs`, `**/*.md`, `**/*.pdf`, `**/*.docx`, `**/.env`,
`**/.env.*`, `**/*.tsbuildinfo`. Поэтому `labs/`, `tmp/`, `.worktrees/`, `.git`, `frontend/`,
PDF/DOCX и любые `.env` не попадают в контекст по построению, а не по списку исключений.
У web свой контекст (`frontend/`) и свой файл `infra/docker/web.Dockerfile.dockerignore`
(`node_modules`, `.next`, `e2e`, `.env*` и т.д.; `.env.local` не запекается в образ).

### 3. `docker-compose.yml`

- YAML-якоря: `x-bff-build`, `x-bff-env`, `x-db-env`, `x-bff-healthcheck`, `x-bff-depends`.
- (Устарело, см. «Исправления по ревью» п. 2 и 5.) Общее несекретное окружение BFF: `NODE_ENV=production`, `FHIR_BASE_URL=http://hapi:8080/fhir`,
  `REDIS_URL=redis://redis:6379`, `RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672`
  (контейнер rabbitmq работает с пользователем `guest` по умолчанию: в официальном образе
  ограничение «только loopback» снято; в проде задаётся свой пользователь),
  `JWT_JWKS_URI=http://auth-service:3001/.well-known/jwks.json`,
  `JWT_ISSUER=${JWT_ISSUER:-http://medcenter.localhost:8081}`. Переменная читается из
  `apps/auth-service/src/modules/oauth/oauth.module.ts` (`source['JWT_ISSUER']`) и из
  `libs/config/src/lib/env.schema.ts`; одно значение для подписанта и всех проверяющих.
- БД (auth-service, analytics-service): `DB_HOST=postgres`, `DB_PORT=5432`,
  `DB_USERNAME=medcenter`, `DB_NAME=medcenter`, `DB_PASSWORD=${POSTGRES_PASSWORD}`.
  В `auth-env.ts` и `analytics-env.ts` приоритет `DB_*` выше `POSTGRES_*`, поэтому
  `POSTGRES_PORT=5433` из `.env` (порт хоста) внутри сети не мешает.
- (Устарело, п. 2.) Секреты приходили через `env_file: .env` у всех BFF; теперь `env_file` только у auth-service.
- Сервисы и порты: auth 3001, practitioner 3002, catalog 3003, patient 3004,
  appointment 3005, notification 3006 (`CONSUMER_ENABLED=true`), encounter 3007,
  analytics 3008. Все собираются из одного Dockerfile с `args: { APP, PORT }`.
- Healthcheck: `node -e fetch(http://127.0.0.1:$PORT$HEALTH_PATH)`, успех при любом статусе
  < 500; `interval 10s`, `timeout 5s`, `retries 12`, `start_period 30s`. Пути:
  - auth-service: `/.well-known/jwks.json`;
  - analytics, appointment, encounter, patient: `/health` (в коде есть `health.controller.ts`);
  - practitioner, catalog, notification: `/health` — выделенного маршрута пока нет, сервис
    отвечает 401/404 (глобальный JWT-guard), это считается «жив». Когда появится реальный
    `/health`, 503 пометит контейнер как unhealthy. Это проверка живости процесса и порта,
    а не готовности зависимостей.
- `depends_on`: BFF ждут `redis` и `rabbitmq` (healthy), `auth-service` (healthy: он издатель
  JWKS) и `hapi` (`service_started`, в distroless-образе нет shell для healthcheck);
  auth-service ждёт `postgres` и `redis`; analytics-service дополнительно `postgres`.
- (Устарело, п. 5: теперь все порты только на `127.0.0.1`.) Порты на хост: auth-service `3001` (отладка OAuth/JWKS напрямую, только dev), traefik
  `443` и `8081` (простой HTTP dev-вход), web `3000`, а также прежние порты инфраструктуры
  (postgres `${POSTGRES_PORT:-5432}`, redis `${REDIS_HOST_PORT:-6380}`, rabbitmq
  `${RABBITMQ_HOST_PORT:-5672}`, hapi `8080`). Остальные BFF наружу не опубликованы.
- Traefik получил сетевой alias `medcenter.localhost`. Браузер резолвит `*.localhost` в
  loopback (-> опубликованный `:8081`), контейнеры — в Traefik по сети compose. Поэтому один
  и тот же `AUTH_BACKEND_URL=http://medcenter.localhost:8081` работает и для редиректа
  браузера на `/oauth/authorize`, и для серверных вызовов `/oauth/token|revoke` из web.

### 4. `web` (`infra/docker/web.Dockerfile`, контекст `frontend/`)

- Next.js 15.0.3, `output: 'standalone'`; стадии `deps` (`npm ci`), `build`
  (`npm run build`), `runtime` (`.next/standalone` + `.next/static` + `public`,
  `USER node`, tini, `node server.js`).
- Build-arg `NEXT_PUBLIC_API_URL=http://traefik:8081`. Значение запекается при сборке
  (`NEXT_PUBLIC_*` и rewrite в `routes-manifest.json`), смена требует пересборки.
- `frontend/next.config.js` (неотслеживаемый) влит в `frontend/next.config.mjs` и удалён:
  `output: 'standalone'`, rewrite `/api/v1/:path*` -> `${NEXT_PUBLIC_API_URL ?? 'http://localhost:8081'}/api/v1/:path*`.
  Браузер ходит на относительный `/api/v1`, серверная часть Next проксирует на Traefik.
- Переменные web-контейнера (изучены `frontend/src/app/api/auth/*`, `lib/server-fetch.ts`):
  `AUTH_BACKEND_URL=http://medcenter.localhost:8081`,
  `OAUTH_CLIENT_ID=${WEB_OAUTH_CLIENT_ID:-medcenter-web}`, `PORT=3000`, `HOSTNAME=0.0.0.0`.
  `env_file` не подключён намеренно: web — публичный PKCE-клиент, секреты бэкенда ему не нужны.
  Флаг `secure` у cookie: `NODE_ENV=production || https`; в контейнере всегда `Secure`, браузеры
  принимают такие cookie для `http://localhost`.
- redirect_uri строится как `<origin>/api/auth/callback`, то есть
  `http://localhost:3000/api/auth/callback`. Именно его нужно внести в `OAUTH_CLIENTS_JSON`
  (клиент `medcenter-web`, `isPublic: true`).
- Healthcheck: `GET /api/auth/session` (отвечает 200 без обращения к auth-service).

### 5. `infra/traefik/dynamic.yml`

Все backend-URL указывают на контейнеры compose (`http://<service>:<port>`, включая
`hapi:8080`); роутеры и приоритеты не менялись. В `security-headers` опция
`contentTypeOptions` заменена на `contentTypeNosniff` (имя опции Traefik v3);
заголовок `X-Content-Type-Options: nosniff` подтверждён в ответе. Роутер для web не добавлен
осознанно: web опубликован на хостовом порту 3000 (origin определяет `redirect_uri` OAuth),
а корневой catch-all на Traefik конфликтовал бы с `/oauth`, `/.well-known` и `/fhir`.
Это отражено в комментарии в начале файла.

## Как запускать

```bash
docker compose up -d --build          # весь стек
open http://localhost:3000            # web (вход в браузере)
curl -i http://localhost:8081/api/v1/notifications   # dev-вход Traefik, 401 без токена
docker compose build notification-service            # один сервис
docker compose up -d --no-deps notification-service  # без зависимостей
```

Сборка 8 образов параллельно тяжёлая (полный `npm ci` в каждом `build`-стейдже, общий кеш
npm смягчает это). Для одного сервиса: `docker compose build <service>`.

## Переменные для `.env` (только имена)

Обязательные:
- `POSTGRES_PASSWORD` (postgres, hapi, DB_PASSWORD у auth/analytics);
- `FHIR_CLIENT_ID`, `FHIR_CLIENT_SECRET`;
- `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` (auth-service; остальные BFF проверяют через JWKS);
- `OAUTH_CLIENTS_JSON` (клиент `medcenter-web` с redirect `http://localhost:3000/api/auth/callback`).

Необязательные:
- `JWT_ISSUER` (по умолчанию `http://medcenter.localhost:8081`), `JWT_KEY_ID`,
  `RATE_LIMIT_PER_MINUTE`, `AUTH_SESSION_SECRET` (иначе используется `JWT_PRIVATE_KEY`);
- `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_FIRST_NAME`,
  `BOOTSTRAP_ADMIN_LAST_NAME` (первый администратор);
- `POSTGRES_PORT`, `REDIS_HOST_PORT`, `RABBITMQ_HOST_PORT` (порты на хосте);
- `WEB_OAUTH_CLIENT_ID` (по умолчанию `medcenter-web`);
- `AUDIT_SYNC_ENABLED`, `AUDIT_SYNC_INTERVAL_MS` (analytics-service).

(Устарело, п. 2.) Имена в контейнере notification-service подтверждены через `env | cut -d= -f1`: из `.env`
приходили `FHIR_CLIENT_ID`, `FHIR_CLIENT_SECRET`, `JWT_KEY_ID`, `JWT_PRIVATE_KEY`,
`JWT_PUBLIC_KEY`, `OAUTH_CLIENTS_JSON`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`,
`RATE_LIMIT_PER_MINUTE`.

## Результаты проверок (реальные)

| Проверка | Результат |
|---|---|
| `docker compose config -q` | exit 0 |
| `docker compose config --services` | 14 сервисов (список выше) |
| Негативный тест: `docker build -f infra/docker/nest-service.Dockerfile --target build .` без `APP` | падает с «build-arg APP (Nx project name) is required», exit 1 |
| `docker compose build notification-service` | образ собран (`npx nx build` внутри образа, ~54 с на прогон со слоями из кеша); размер 438 MB |
| `docker compose up -d --no-deps notification-service` | контейнер healthy (`docker inspect` -> `healthy` с 1-й проверки); процесс `uid=1000(node)`, `PORT=3006`, `NODE_ENV=production` |
| Traefik -> notification | `GET http://localhost:8081/api/v1/notifications` -> **401** `application/problem+json` (не 502); `GET /api/v1/notifications/x` -> 404; заголовки `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` от `security-headers` на месте |
| `docker compose build web` | образ собран (`npm run build` Next 15.0.3 внутри образа), 306 MB, содержимое рантайма `server.js`, `node_modules`, `public`, 51.9 MB, `uid=1000(node)` |
| web healthy | `docker compose ps`: `Up ... (healthy)`, порт `0.0.0.0:3000->3000`; лог `Next.js 15.0.3 ... Ready in 470ms` |
| Страницы web | `GET /` -> 200 (заголовок «Медицинский центр»); `GET /doctors` -> 200 (заголовок «Врачи», страница рендерится в состоянии «данные недоступны», так как catalog-service не запущен); `GET /login` -> 200; `GET /api/auth/session` -> 200 с анонимным JSON (все поля `null`) |
| Прокси `/api/v1` через web | `GET http://localhost:3000/api/v1/notifications` -> 401 (web -> `traefik:8081` -> notification-service) |
| Alias `medcenter.localhost` | из web-контейнера `fetch('http://medcenter.localhost:8081/.well-known/jwks.json')` -> 502 (DNS резолвится в Traefik; 502 потому что auth-service не запущен); `fetch('http://traefik:8081/api/v1/notifications')` -> 401 |
| Контекст сборки | инкрементальная передача: 10.13 kB (nest), 9.41 kB (web); полный белый список: `package*.json`, `nx.json`, `tsconfig.base.json`, `apps/`, `libs/` |

## Не проверено и ограничения

- Не собирались и не запускались сервисы, которые редактирует параллельный поток:
  auth-service, patient-service, practitioner-service, catalog-service, appointment-service,
  encounter-service, analytics-service. Для них проверен только синтаксис compose и
  согласованность (имена Nx-проектов совпадают с `apps/*/project.json`, порты по умолчанию в
  `main.ts` совпадают с compose для 3001, 3002, 3003, 3005, 3006, 3007, 3008; у
  `patient-service` берёт порт из `env.PORT` общей схемы с умолчанием 3000, поэтому
  `PORT=3004` из compose обязателен).
- Контейнер auth-service сейчас `Exited (143)` и использует образ, собранный 4 дня назад
  по старому Dockerfile. Пока он не пересобран, `/oauth/*` и `/.well-known/*` на Traefik
  отвечают 502, вход в web не проверялся (проверено, что `/`, `/doctors`, `/login` и
  `/api/auth/session` отвечают без него).
- Healthcheck у BFF проверяет только отклик процесса (< 500). Для practitioner, catalog и
  notification выделенного `/health` нет (ответ 401/404 засчитывается как «жив»).
- Notification-service при старте обрабатывает старые сообщения из очереди; в логе видна
  одна запись «notification write failed; dead-lettering» (HAPI-1094: ссылка на
  несуществующий `Patient/...` в событии `appointment.booked.v1`). Это данные в брокере, к
  стеку контейнеров не относится.
- (Устарело, п. 5.) RabbitMQ в compose использовал учётную запись `guest`; теперь пользователь и
  пароль берутся из `.env`.
- Каталоги `tools/**` в состоянии git изменены/добавлены (terminology-seed, `tools/shared`) —
  это не относится к данной задаче, не тронуто.

## Изменённые файлы

- `docker-compose.yml`
- `.dockerignore`
- `infra/docker/nest-service.Dockerfile` (новый)
- `infra/docker/web.Dockerfile` (новый)
- `infra/docker/web.Dockerfile.dockerignore` (новый)
- `infra/traefik/dynamic.yml`
- `frontend/next.config.mjs` (`frontend/next.config.js` удалён)
- `tasks/TASK-001/coder-stack-compose-report.md` (этот отчёт)

---

# Исправления по ревью (раунд 1)

Дата: 2026-10-14. Скилл: `coder`. Полностью исправлены 6 из 8 замечаний (п. 1-5 и 8); по п. 6 и 7 сделана
часть в моих путях и проверено исправление, а кодовая часть передана владельцам. Ни один файл вне
`docker-compose.yml`, `infra/**`, `frontend/next.config.mjs` не менялся. Git-команд, меняющих
состояние, не запускалось; `.env*` не читались (проверки env сделаны по именам).

| # | Серьёзность | Статус | Суть |
|---|---|---|---|
| 1 | critical | исправлено | HAPI больше не торчит наружу |
| 2 | major | исправлено | секреты ограничены по сервисам |
| 3 | major | исправлено | добавлен роутер `/api/v1/encounters` |
| 4 | major | исправлено | убраны Docker provider и docker.sock |
| 5 | major | исправлено | порты на loopback, пароли RabbitMQ и Redis из `.env` |
| 6 | major | compose готов, код у backend | `TRUST_PROXY` во всех BFF; чтение переменной в `main.ts` вне моих путей |
| 7 | major | передано frontend | исправление проверено на копии, в исходники не вносилось |
| 8 | major | исправлено | заголовки безопасности и `poweredByHeader: false` у web |

## 1. HAPI без аутентификации на edge (critical)

- `infra/traefik/dynamic.yml`: роутер `fhir` (`PathPrefix(/fhir)`) заменён на `fhir-metadata` с
  правилом ``Path(`/fhir/metadata`) && Method(`GET`)``. Это единственный опубликованный путь HAPI
  (CapabilityStatement, NFR-010, `specs/api-designer-spec.md:20-22`). BFF ходят к HAPI напрямую
  по `http://hapi:8080/fhir` внутри сети.
- `docker-compose.yml`: `hapi.ports` = `127.0.0.1:8080:8080`. Порт на хосте оставлен: host-run
  seed-утилиты используют `http://localhost:8080/fhir` (`tools/shared/seed-env.ts`).
- Проверено вживую после пересоздания traefik и hapi (данные HAPI целы: CodeSystem 4, ValueSet 5,
  Practitioner 4):

| Запрос к `http://localhost:8081` | До | После |
|---|---|---|
| `GET /fhir/metadata` | 200 | 200 (`application/fhir+json`) |
| `GET /fhir/Patient?_count=1` | 200 по описанию ревью | 404 (ответ самого Traefik) |
| `POST /fhir/Patient`, `PUT /fhir/Patient/1`, `DELETE /fhir/Patient/1` | открыт | 404, 404, 404 |
| `POST /fhir/metadata`, `GET /fhir`, `GET /fhir/` | открыт | 404, 404, 404 |

  То же через TLS: `https://localhost/fhir/metadata` -> 200, `https://localhost/fhir/Patient` -> 404.
- Доступность с LAN-адреса хоста (172.20.10.4), проверка TCP-подключением: порты 8080, 8081, 443,
  3000, 3001 закрыты; с `127.0.0.1` открыты.

## 2. Весь `.env` в каждом BFF (major)

- `env_file: .env` оставлен только у `auth-service`: он владеет ключевой парой JWT, реестром
  OAuth-клиентов, секретом сессии и bootstrap-администратором.
- Остальные BFF получают только то, что читают (якорь `x-bff-env`): `NODE_ENV`, `FHIR_BASE_URL`,
  `REDIS_URL`, `JWT_JWKS_URI`, `JWT_ISSUER`, `RATE_LIMIT_PER_MINUTE`, `TRUST_PROXY`, а также
  `FHIR_CLIENT_ID`, `FHIR_CLIENT_SECRET`, `FHIR_TIMEOUT_MS` без значения: Compose берёт их из `.env`,
  а если там их нет, переменная в контейнере не задаётся (проверено, пустых строк нет, поэтому
  пара `FHIR_CLIENT_*` в patient-service остаётся «обе или ни одной»).
- `DB_PASSWORD` (из `POSTGRES_PASSWORD`) получают только auth-service и analytics-service.
  `AUDIT_SYNC_ENABLED` и `AUDIT_SYNC_INTERVAL_MS` проброшены только analytics-service (раньше
  приходили через `env_file`).
- `RABBITMQ_URL` и зависимость от rabbitmq теперь только у сервисов, которые используют брокер:
  auth-service (издатель событий пациента), appointment, encounter, notification, analytics.
  У patient, practitioner, catalog их нет (в их коде нет импорта `@medcenter/messaging`, схема env
  patient-service прямо исключает RabbitMQ). Якоря: `x-mq-env`, `x-bff-depends-mq`.
- Проверка в свежем контейнере notification-service
  (`docker compose run --rm --no-deps notification-service env`, выводились только имена):
  `APP CONSUMER_ENABLED FHIR_BASE_URL FHIR_CLIENT_ID FHIR_CLIENT_SECRET HEALTH_PATH HOME HOSTNAME
  JWT_ISSUER JWT_JWKS_URI NODE_ENV NODE_VERSION npm_config_* PATH PORT RABBITMQ_URL
  RATE_LIMIT_PER_MINUTE REDIS_URL TRUST_PROXY YARN_VERSION`.
  Больше нет `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_KEY_ID`, `OAUTH_CLIENTS_JSON`,
  `POSTGRES_PASSWORD`, `POSTGRES_PORT`.
- По `docker compose config --format json` (имена ключей): `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`,
  `OAUTH_CLIENTS_JSON` встречаются только в auth-service.

## 3. Нет роутера для encounter-service (major)

- Добавлен роутер `encounters`: ``PathPrefix(`/api/v1/encounters`)`` -> `encounter-service`,
  middleware `security-headers`.
- Проверка маршрутов целиком: из контроллеров всех `apps/*` извлечено 62 маршрута
  (`@Controller` + `@Get/@Post/@Patch/@Delete`), каждый отправлен через отдельный экземпляр Traefik
  (та же `dynamic.yml`, JSON access log), по логу сверены `RouterName` и `ServiceName`.
  Итог: 56 маршрутов попали в правильный сервис; 5 `GET /health` (analytics, appointment, auth,
  encounter, patient) и `GET /` у auth-service внутренние и на edge намеренно не публикуются.
  Лишних и неверных маршрутов нет. До исправления `GET /api/v1/encounters/x` давал 404 Traefik, теперь 502
  (роутер есть, сервис в этой среде не запущен).

## 4. docker.sock в Traefik (major)

- Удалены `--providers.docker=true`, `--providers.docker.exposedbydefault=false` и том
  `/var/run/docker.sock`. Маршрутизация целиком в file provider (меток `traefik.*` ни у одного
  сервиса не было).
- Проверено: `docker inspect` traefik показывает единственный том (`infra/traefik`),
  `docker exec medcenter-traefik-1 ls /var/run/docker.sock` -> «No such file or directory».
- Дополнительно (дёшево): `--global.checknewversion=false` и `--global.sendanonymoususage=false`
  (Traefik по умолчанию отправляет анонимную статистику).

## 5. Порты на всех интерфейсах, пароли по умолчанию (major)

- Все опубликованные порты имеют префикс `127.0.0.1:`: postgres, redis, rabbitmq, hapi, auth-service
  `3001`, traefik `443` и `8081`, web `3000`.
- RabbitMQ: `RABBITMQ_DEFAULT_USER=${RABBITMQ_USER:-medcenter}`,
  `RABBITMQ_DEFAULT_PASS=${RABBITMQ_PASSWORD:?...}`; тот же пользователь и пароль подставляются в
  `RABBITMQ_URL`. Учётная запись `guest` не создаётся.
- Redis: `redis-server --requirepass ${REDIS_PASSWORD:?...}`, healthcheck с `redis-cli -a`,
  в `REDIS_URL` BFF пароль подставляется (`redis://:<пароль>@redis:6379`).
- Проверка на изолированном проекте `medcenter-verify` (без публикации портов, потом удалён вместе
  со своими томами; живой проект не затронут): redis и rabbitmq `healthy`; `redis-cli ping` без пароля ->
  `NOAUTH Authentication required.`; процесс redis работает от пользователя `redis`;
  `rabbitmqctl list_users` -> только `medcenter`, `authenticate_user guest guest` -> ошибка;
  notification-service с новыми URL: `healthy`, лог «notification consumer is listening», соединение
  AMQP под пользователем `medcenter`, `ioredis` по `REDIS_URL` из контейнера -> `PONG`.
- Побочная находка (чинится вместе): `:443` отвечал обычным HTTP, а TLS-рукопожатие получало 404, то есть
  «TLS на 443» из комментария не работало. Добавлено `--entrypoints.websecure.http.tls=true`:
  `https://localhost/api/v1/notifications` (`-k`) -> 401, заголовок `Strict-Transport-Security` на месте.

## 6. Один rate-limit bucket за Traefik (major, часть вне моих путей)

- Сделано в compose: `TRUST_PROXY: '1'` перенесён в `x-bff-env`, то есть передаётся всем BFF (у
  auth-service лежал отдельной строкой).
- Не сделано (backend-воркфлоу): ни один `apps/*/src/main.ts`, кроме auth-service, не вызывает
  `app.getHttpAdapter().getInstance().set('trust proxy', ...)`, поэтому `RateLimitGuard` ключует анонимный
  трафик по IP контейнера Traefik. Нужно вынести `parseTrustProxy` из
  `apps/auth-service/src/config/trust-proxy.ts` в `libs/common` и вызывать его в `main.ts` каждого BFF
  (минимум practitioner, catalog, patient, appointment, encounter, notification, analytics).
  Пока этого нет, `TRUST_PROXY` в этих контейнерах безвреден, но не работает.

## 7. `/doctors` пререндерится при `docker build` с состоянием ошибки (major, исходники frontend не мои)

- Подтверждено в образе `medcenter-web`: `.next/server/app/doctors.html` содержит
  «Не удалось загрузить список врачей», `initialRevalidateSeconds` = 300.
- Исправление не в Dockerfile, а в `frontend/src/app/(public)/doctors/page.tsx`: первой строкой
  `export const dynamic = 'force-dynamic';`.
- Проверено на копии в scratchpad (исходники не менялись): с этой строкой `next build` в образе
  не создаёт `doctors.html/.rsc/.meta`, маршрута нет в `prerender-manifest.json`, статического HTML с
  баннером нет. Другие страницы с `publicApiFetch`: `doctors/[doctorId]` динамическая, без
  `generateStaticParams`, пререндер ей не грозит.
- Живой web сейчас показывает баннер, потому что catalog и practitioner не запущены; после правки
  страница будет рендериться на запрос.

## 8. Web на :3000 без заголовков безопасности (major)

- `frontend/next.config.mjs`: `poweredByHeader: false` и `async headers()` для `/:path*`:
  `Content-Security-Policy` (`default-src 'self'`; `script-src 'self' 'unsafe-inline'`, плюс
  `'unsafe-eval'` только в dev; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`;
  `font-src 'self' data:`; `connect-src 'self'`; `object-src 'none'`; `base-uri 'self'`;
  `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. `form-action` намеренно не
  задан: цепочка редиректов входа заканчивается на другом origin. `'unsafe-inline'` нужен, потому что
  Next вставляет inline-скрипты гидрации; строгий CSP с nonce потребует middleware.
- Образ `medcenter-web` пересобран (`npm run build`: lint и типы пройдены), контейнер `healthy`.
  `curl -I http://localhost:3000/login` и `/api/auth/session`: все пять заголовков на месте,
  `X-Powered-By: Next.js` отсутствует.
- Браузер (Browser pane): `/`, `/login`, `/doctors` отрисованы, ошибок консоли и нарушений CSP нет,
  гидрация React работает (на DOM есть `__reactFiber`, `window.__next_f` определён).
- Дополнительно (дёшево): middleware `security-headers` в Traefik теперь удаляет `X-Powered-By`
  (`customResponseHeaders: X-Powered-By: ''`). 401 от notification-service без `X-Powered-By: Express`
  и на :8081, и через прокси web. Само отключение в BFF (`app.disable('x-powered-by')`) за backend.

## Прочее исправленное по пути

- Том Traefik: вместо одного файла примонтирован каталог `./infra/traefik:/etc/traefik/dynamic:ro`.
  Одиночный bind-mount файла терял связь при сохранении редактором с заменой inode (в логе Traefik
  появилась ошибка «open ... no such file», маршруты перестали перечитываться). Проверено: после
  замены файла через `mv` (inode 1423417 -> 1423779) Traefik подхватил новое правило (404/502 меняются),
  ошибок в логе 0.

## Что нужно сделать, чтобы стек применил исправления целиком

1. Добавить в `.env` три имени (значения придумать самому, без спецсимволов URL, например
   `openssl rand -hex 16`): `RABBITMQ_PASSWORD`, `REDIS_PASSWORD` и по желанию `RABBITMQ_USER`.
   Без `RABBITMQ_PASSWORD` и `REDIS_PASSWORD` compose намеренно отказывается стартовать с понятным
   сообщением (`required variable ... is missing a value`). `.env.example` не мой путь и не читался,
   имена туда нужно добавить отдельно.
2. Для host-run сервисов (`nx serve`) обновить URL в `.env`:
   `REDIS_URL=redis://:<REDIS_PASSWORD>@localhost:6380`,
   `RABBITMQ_URL=amqp://<RABBITMQ_USER>:<RABBITMQ_PASSWORD>@localhost:5672`.
3. Применить: `docker compose up -d --build`, а для rabbitmq один раз `docker compose up -d -V rabbitmq`
   (переменные `RABBITMQ_DEFAULT_*` действуют только на пустой каталог данных; `-V` создаёт новый
   анонимный том и не удаляет старый).

## Состояние живого стека после правок

- Пересозданы и работают по новой конфигурации: `traefik` (без docker.sock, loopback, TLS на 443),
  `hapi` (loopback), `web` (заголовки).
- Намеренно не тронуты `postgres`, `redis`, `rabbitmq` и `notification-service`: пароли Redis и RabbitMQ
  в `.env` ещё не заданы, пересоздание с временными значениями оставило бы живой стек в состоянии,
  которое сломается при первом `docker compose up` с реальным `.env`. Пока они работают по старой
  конфигурации: порты `5433`, `6380`, `5672` по-прежнему слушают `0.0.0.0` (проверено: открыты по
  LAN-адресу), а контейнер notification-service ещё содержит прежний полный набор переменных. Новая
  конфигурация применится после шагов выше.
- Контейнер auth-service по-прежнему `Exited (143)`: образ не пересобирался (код сервиса правит параллельный
  воркфлоу). Без него `/oauth/*` и `/.well-known/*` дают 502.

## Результаты проверок (раунд 1)

| Проверка | Результат |
|---|---|
| `docker compose config -q` (переменные заданы) | exit 0, 14 сервисов |
| `docker compose config -q` без `RABBITMQ_PASSWORD`, `REDIS_PASSWORD` | ошибка «required variable ... is missing a value: set ... in .env» (ожидаемо) |
| Поиск в `docker-compose.yml` и `dynamic.yml`: `docker.sock`, `providers.docker`, `0.0.0.0`, `guest:guest` | только комментарии и `HOSTNAME: 0.0.0.0` внутри web-контейнера |
| Аудит маршрутов через отдельный Traefik | 56 из 56 API-маршрутов в верный сервис, 5 `/health` и `GET /` внутренние |
| `/fhir/*` через edge (HTTP и TLS) | только `GET /fhir/metadata` -> 200, остальное 404 |
| Порты по LAN-адресу | 8080, 8081, 443, 3000, 3001 закрыты |
| Изолированная проверка Redis и RabbitMQ с паролями | NOAUTH без пароля, `guest` отвергается, notification-service `healthy` и подключён как `medcenter` |
| Web: `docker compose build web`, `healthy`, заголовки, браузер | сборка с lint и типами пройдена, 5 заголовков, нет `X-Powered-By`, консоль пустая, гидрация работает |
| Edge: `X-Powered-By` | удаляется |
| Hot reload Traefik при замене inode файла | работает (каталог примонтирован целиком) |
| Тесты юнитов | не запускались: изменены только compose, YAML Traefik и `next.config.mjs` |

## Не проверено и ограничения (дополнение)

- Redis и RabbitMQ с паролями проверены на изолированном проекте с notification-service; остальные BFF
  с новыми URL не поднимались (образы auth, patient, practitioner, catalog, appointment, encounter,
  analytics не пересобирались: код параллельного воркфлоу может быть в процессе правки).
- Пароль в `REDIS_URL` и `RABBITMQ_URL` не кодируется процентным кодированием: спецсимволы в нём сломают URL.
- Конфигурация CSP проверена только на публичных страницах и странице входа (`/`, `/login`, `/doctors`);
  страницы за авторизацией в браузере не открывались (auth-service не запущен).
- `docker compose up -V` и пересоздание postgres, redis, rabbitmq не выполнялись на живом стеке.

## Изменённые файлы (раунд 1)

- `docker-compose.yml`
- `infra/traefik/dynamic.yml`
- `frontend/next.config.mjs`
- `tasks/TASK-001/coder-stack-compose-report.md` (этот отчёт)

## Передано другим владельцам

- Backend: чтение `TRUST_PROXY` в `main.ts` каждого BFF (п. 6); `app.disable('x-powered-by')`;
  добавить `RABBITMQ_PASSWORD`, `REDIS_PASSWORD`, `RABBITMQ_USER` в `.env.example`.
- Frontend: `export const dynamic = 'force-dynamic';` в `(public)/doctors/page.tsx` (п. 7).
