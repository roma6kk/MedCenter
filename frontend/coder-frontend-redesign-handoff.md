# Redesign — handoff для следующего агента

Дата: 2026-10-21 · Ветка: `feature/frontend-redesign` (от `feature/clinic-platform-wip`, коммит `dde8987`) · Навык: `coder-frontend`

Цель: перенести утверждённый дизайн в код `frontend/` страница за страницей, не ломая тесты, a11y и i18n.
Рекомендуемая модель: **Sonnet 5.5** (Opus 5.5 — только если дизайн придётся править).

## 1. Источник дизайна

Холст Claude Design (приватный, доступ у владельца аккаунта): <https://claude.ai/artifact/JdsGZpAGi2JfrkyukEunEp>
Читать так: `Artifact` → `action: "read"`, `url` выше, `path: "project/<Имя>.dc.html"`. Доски — это эталон вёрстки; **вставлять их HTML в код нельзя**, переносятся токены, структура и тексты.

Локальный слепок на этой машине (может исчезнуть вместе с временной папкой сессии):
`/tmp/claude-1000/-mnt-BE48B9DF48B9971D-projs-MedCenter/1276cee6-2bbe-424d-bf53-5cb0457f82e1/scratchpad/design/project/`

| Страница | Доска | Маршрут |
|---|---|---|
| Главная | `MainB.dc.html` | `/` |
| Токены (светлая и тёмная) | `Tokens.dc.html` | — |
| Запись, шаг 1 | `Booking.dc.html` | `/booking` |
| Мои записи | `Appointments.dc.html` | `/appointments` |
| Журнал врача (День / Неделя) | `DoctorJournal.dc.html` | `/doctor/appointments` |
| Аналитика (отчёт с выводами) | `AdminAnalyticsC.dc.html` | `/admin/analytics` |

В досках то, чего нет в системе, помечено `[ПЛЕЙСХОЛДЕРОМ]` (фото, адреса, причины обращения, ФИО врача…). Не придумывать данные для живых экранов; для таких мест — аккуратная пустая или нейтральная подпись.

## 2. Состояние на сейчас

### Сделано (не закоммитировано, в рабочей копии)

| Что | Где |
|---|---|
| Токены светлой темы + soft/inverse + радиусы, шрифты `--font-sans`/`--font-mono`; заголовки и `.serif` теперь на Onest | `src/styles/globals.css` |
| Тёмная тема — только по `:root[data-theme='dark']`, **автоопределения по `prefers-color-scheme` нет намеренно** (пока не проверены все экраны) | там же |
| Tailwind: цвета `primary.soft`, `destructive.soft`, `warning.soft`, `success.soft`, `inverse.*`; радиусы `rounded-control/card/panel`; `font-sans/mono` | `tailwind.config.ts` |
| Шрифты Onest и JetBrains Mono как npm-пакеты `@fontsource-variable/*` (самохостинг, кириллица, сеть при сборке не нужна) | `package.json`, `src/app/layout.tsx` |
| Контрастный спек в обеих темах: все пары токенов ≥ 4.5:1, поля ≥ 3:1 (39 тестов зелёные) | `src/styles/globals-contrast.spec.ts` |
| `cn()` (clsx + tailwind-merge) | `src/lib/ui/cn.ts` (+ spec) |
| `Button` + `buttonVariants` (варианты `primary/secondary/soft/danger/ghost/inverse`, размеры `md` 44px и `lg` 52px), `Card` (`radius: card|panel`, `padding`, `as`) | `src/components/ui/` (+ `ui.spec.tsx`) |
| Статический контент главной: лицензия, реквизиты, контакты, компании-клиенты, страховые партнёры, направления (иконки lucide), якоря | `src/components/catalog/home-content.ts` |

Проверено: `tsc --noEmit` без ошибок, `next lint` без замечаний, спеки `styles`, `ui`, `lib/ui` зелёные.
**Полный `jest` после правок не перезапускался.** Базовая линия до правок: 172 набора, 1794 теста — зелёные. Первое, что нужно сделать, — прогнать его снова.

### Страница 1 (главная): ГОТОВА (2026-10-22, не закоммичена)
- Сделано: `home-view.tsx` и секции `home-hero|trust|directions|path|audiences|contacts.tsx`, `hero-illustration.tsx`, `public-shell.tsx` (шапка, якорная навигация, телефон) + `public-footer.tsx`, `DoctorCard`/`ServiceGrid`/`DoctorProfileLink` на токенах и примитивах, ключи `home.*`/`public.*` в `ru.json` и `en.json`, спеки `home-view.spec.tsx` (10 тестов) и `public-shell.spec.tsx` (7).
- Проверено: `npx jest` — 174 набора / 1841 тест зелёные, `tsc --noEmit` и `next lint` чистые, `NODE_ENV=production npm run build` проходит; скриншоты `/` и `/doctors` в светлой и тёмной теме, 1280 и 390 px просмотрены.
- Спека обновлена: `specs/frontend-design-spec.md` (раздел `[REDESIGN]`) и строка в `specs/MANIFEST.md`.
- Ограничение: тёмная тема по-прежнему только по `data-theme="dark"` и проверена лишь на публичных страницах.

### Параллельные сессии (запущены 2026-10-22, каждая в своём worktree от `2f0f7bf`)
| Область | Сессия | Ветка |
|---|---|---|
| Кабинет пациента (оболочка, запись, мои записи, история, назначения, профиль, уведомления) | `redesign-patient` | `claude/redesign-patient-03c1a4` |
| Врач + общая боковая панель `staff-shell` | `redesign-doctor` | `claude/redesign-doctor-036e10` |
| Администрирование (аналитика-отчёт и остальные страницы) | `redesign-admin` | `claude/redesign-admin-d0c4ea` |
| Вход, регистрация, страницы 403/404/ошибки | `redesign-auth` | `claude/redesign-auth-5db914` |

Владельцы общих файлов и правила слияния заданы в брифах сессий; ключи сообщений правятся только в своих пространствах имён.
Страницы публичной части (главная, `/doctors`) закреплены за основной сессией.

## 3. Данные главной: демонстрационные

`home-content.ts` содержит выдуманную лицензию, реквизиты и контакты на зарезервированных доменах (`*.example`), а также **реальные названия компаний** (клиенты и страховые партнёры). Это не факты о договорах клиники. Обязательно:
- показать под списком компаний и в подвале заметку `home.demoNote` («демонстрационные данные», на ru и en);
- рендерить названия только текстом, без логотипов и товарных знаков;
- перед публикацией заменить своими данными (владелец проекта знает об этом).

## 4. Следующая страница: `/booking` (запись, шаг 1)

Эталон: `Booking.dc.html`. Общий каркас кабинета пациента (`PatientShell`) используется ещё и на `/appointments` (`Appointments.dc.html`), поэтому его переделка закрывает шапку обеих страниц.

### Карта файлов
- `src/app/(patient)/booking/page.tsx`, `src/components/booking/booking-screen.tsx` (заголовок), `booking-wizard.tsx` (логика шагов — **не менять**),
- `booking-stepper.tsx`, `service-step.tsx`, `doctor-step.tsx`, `slot-step.tsx`, `confirm-step.tsx`, `booking-success.tsx`,
- `src/components/layout/patient-shell.tsx`, `nav-link.tsx`, `notification-bell.tsx`, `locale-switcher.tsx`, `logout-button.tsx`.

### Что нужно сделать (по доске)
- **Шапка** кабинета: квадратный логотип, ссылки-«пилюли» (активная — `bg-primary-soft text-primary-soft-foreground`), колокольчик 44px с бейджем, «Выйти» (`Button` secondary). Ширина контента `max-w-[1200px]` (сейчас `max-w-5xl`).
- **Заголовок** 34px + подпись «Четыре шага — около двух минут» (новый ключ `booking.subtitle`).
- **Степпер**: 4 колонки, сверху полоса 4px (пройденные и текущий — primary), номер в круге. Сохранить поведение: пройденные шаги — кнопки с `aria-label` по ключу `stepBack`, текущий — `aria-current="step"`.
- **Карточки услуг**: радиус 16; выбранная — рамка 2px primary + кольцо 4px `primary-soft` + круг с галочкой; невыбранная — круг-«радио»; длительность — моно-пилюля; «Не знаю, какая услуга нужна» — пунктирная карточка на всю ширину с иконкой «?». Сохранить `data-testid="service-<id>"` и `service-any`, `aria-pressed`.
- **Боковая панель «Ваша запись»** (услуга, врач, время, длительность из черновика), `Card radius="panel"`.

### Решение, которое нужно принять явно
В доске у панели есть кнопка «Далее: выбор врача». В коде выбор услуги **сразу переводит на шаг 2** (`selectService` в `booking-steps.ts` возвращает `step: 2`). Рекомендация: логику не менять, кнопку «Далее» не рисовать, а панель «Ваша запись» показывать на всех четырёх шагах как сводку. Если захотите двухфазный выбор («выбрал → Далее»), это правка `booking-steps.ts` и его спеков, отдельным шагом.

### Тесты, которые нельзя сломать
- Спеки `booking-*.spec.tsx` ищут по ролям и текстам (`getByRole`, `data-testid`), а не по классам, поэтому смена вёрстки их не ломает, а смена текста — ломает.
- Тесты по классам есть в других местах: `admin/analytics/analytics-panel.spec.tsx`, `admin/terminology/terminology-panel.spec.tsx` (`grid-cols-1`), `patient/cabinet-test-utils.tsx` (`min-w-0`, `[overflow-wrap:anywhere]`). Эти классы не трогать.
- `layout/shells.spec.tsx` проверяет оболочки: после переделки `PatientShell` прогнать его первым.
- E2E `e2e/booking-flow.spec.ts` — в основном `fixme`, но `/doctors` рендерится с заголовком «Врачи».

## 5. Общие правила (из `AGENTS.md`, `.clinerules/DOD.md`)

- Весь код только в `frontend/`. Не читать `.env*` и `secrets/`. Не делать `sudo`, `rm -rf`, `--no-verify`, force-push, hard-reset.
- Каждая строка интерфейса — через `useT()`; **ключи добавлять в `ru.json` и `en.json` одновременно** (иначе падает `translate.spec.ts`).
- A11y: цели ≥ 44px; видимый текст должен входить в `aria-label` (WCAG 2.5.3); фокус-кольцо `:focus-visible` и `prefers-reduced-motion` уже в `globals.css`, не отключать; контраст 4.5:1 (спек это проверяет для токенов — новые цвета брать только из токенов, не `#hex` в компонентах).
- Не переименовывать и не удалять существующие `data-testid`.
- Новые `.md` — с префиксом навыка (`coder-frontend-…`), не в `tasks/` и `specs/` без префикса.
- Коммитить только если владелец попросит. В рабочей копии есть чужие untracked-файлы (`labs/`, `*.docx`, `*.pdf`, `**For`, `.claude/settings.local.json`, `frontend/pw-tmp.config.ts`) — не добавлять и не удалять их.

### Definition of Done (Standard) для каждой страницы
`npx jest` (всё) · `npx next lint` · `npx tsc --noEmit` · `npm run build` (в `frontend/`) · скриншоты до/после · краткий Context Summary с доказательствами.

## 6. Как смотреть результат

- **Сборка: `NODE_ENV=production npm run build`.** В окружении этой машины `NODE_ENV=development`, и обычный `npm run build` падает на пререндере `/500` с ошибкой `<Html> should not be imported outside of pages/_document` (к коду это не относится).
- Dev-серверу нужен **перезапуск** после правки `tailwind.config.ts` (иначе новые утилиты вроде `bg-inverse` не попадают в CSS): `node node_modules/next/dist/bin/next dev --port 3000 --hostname 127.0.0.1` в `frontend/`. Не использовать `pkill -f next-server`: это убьёт и чужие dev-серверы.

- Dev-сервер уже работает на `http://localhost:3000` (hot reload). Если нет: `npm run dev` в `frontend/`.
- Скрипты скриншотов Playwright (системный Chrome `/usr/bin/google-chrome`; `chromium` из Playwright не установлен):
  `…/1276cee6-2bbe-424d-bf53-5cb0457f82e1/scratchpad/shoot.js` (публичные страницы) и `shoot-auth.js` (кабинеты под демо-учётками; пароль читается из seed-манифеста только в память, в вывод не попадает). Запуск: `node shoot-auth.js <папка>`.
- Демо-учётки: `npm run seed:demo` (манифест `tools/demo-seed/output/demo-manifest.json`, в git не лежит). Входить только на `localhost`.
- Тёмная тема проверяется добавлением `data-theme="dark"` на `<html>` в DevTools. Переключателя в UI пока нет.

## 7. Открытые вопросы владельцу

1. Включать ли тёмную тему автоматически (`prefers-color-scheme`) после проверки всех экранов, и нужен ли переключатель в шапке.
2. Двухфазный выбор в мастере записи (см. раздел 4).
3. Реальные данные клиники для главной (лицензия, реквизиты, контакты, цены, список компаний) — сейчас демо.
4. Нужны ли разделы «Компаниям», «По страховке», «Новости» как отдельные страницы: сейчас на главной это блоки с якорями и `mailto:`.
