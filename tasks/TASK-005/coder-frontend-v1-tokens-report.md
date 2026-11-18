# TASK-005 / V1 — Дизайн-токены v2 (coder-frontend)

Ветка `docs/task005-ux-audit`, Tailwind остаётся на 3.4 (решение владельца). Ничего не закоммичено.

## Что сделано по пунктам аудита

**VA1 — палитра в OKLCH.** Все цвета `globals.css` (светлая и тёмная темы) переписаны в `oklch(L C H)`, имена токенов сохранены, бирюзовый оттенок 186 сохранён. Добавлено:
- `--primary-hover`, `--primary-strong`, `--primary-soft-hover` (hover/pressed вместо `opacity-90`);
- тёплый акцент `--warm`, `--warm-soft`, `--warm-foreground` (коралл/персик, hue 38–55);
- `--info`, `--info-soft` (синий, hue 245–250);
- `--destructive-foreground`, `--warning-foreground`, `--success-foreground`, `--destructive-soft-hover` — текст на сплошной заливке (раньше `text-white` ломался на тёмной теме);
- `--border-soft` (лёгкая рамка карточки с тенью), `--scrim` (подложка модального окна).
Шкала срочности: critical (=destructive) / warning / info / success / neutral (secondary/muted). Новые цвета зарегистрированы в `tailwind.config.ts`, модификаторы `/alpha` для них не используются.
`globals-contrast.spec.ts` разбирает `oklch(...)` (OKLCH → OKLab → linear sRGB → clamp → относительная яркость, формула Ottosson, источник указан в комментарии), все прежние проверки сохранены, добавлены пары `primary-foreground`/`primary-hover` и `/primary-strong`, `warm-foreground`/`warm-soft`, `info`/`info-soft` и `/card`, `*-foreground` на сплошных заливках, `*-soft-hover`, декоративный `warm` на card >= 3:1; плюс два теста самого конвертера. 63 проверки, обе темы проходят.

**VA3 — переключатель темы.** Три режима system/light/dark (`lib/theme/theme.ts`), хранение в `localStorage` (`mc-theme`, всё в try/catch). Inline-скрипт в `<head>` `app/layout.tsx` ставит `data-theme` до первой отрисовки (system -> `matchMedia`), `suppressHydrationWarning` на `<html>`. `ThemeSync` (в `Providers`) восстанавливает сохранённый режим в стор после гидратации и в режиме system реагирует на смену схемы ОС. `ThemeSwitcher` — три иконочные кнопки Monitor/Sun/Moon с `aria-label`, `aria-pressed`, `title`, 44x44, стоит после `LocaleSwitcher` в `public-shell`, `patient-shell`, `staff-shell`. Ключи `layout.theme.{label,system,light,dark}` в `ru.json` и `en.json`. Один селектор `:root[data-theme='dark']`, комментарий в начале `globals.css` обновлён, добавлен `color-scheme`.

**VB1 — радиусы.** `--radius-sm` (6, бейджи/чипы, и простой `rounded`), `--radius-control` (10), `--radius-card` (16), `--radius-panel` (20), правило вложенности в комментарии. Прежний `--radius` переименован в `--radius-sm`. Заменены все `rounded-md` и произвольные `rounded-[Npx]` (3/4/6 -> sm или control по роли, 8/9/10/12 -> control или sm у вложенных сегментов, 14/18 -> card). Легенда журнала: квадрат 10 px стал 12 px (`size-3`), иначе 6 px скругление давало круг.

**VC1 — шкала шрифтов.** `--step--2 … --step-6` (Utopia, 360–1280 px, 15->16 px, коэффициент 1.2->1.25, в rem). Отклонение от буквального задания: ниже базы использован мягкий коэффициент 1.1->1.125, иначе `text-sm` (181 использование) стал бы 12.5 px. Ключи Tailwind: xs=-2, sm=-1, base=0, lg=1, xl=2, 2xl=3, 3xl=4, 4xl=5, 5xl=6, с line-height. Все 14 произвольных размеров (63 файла) заменены на ключи: 11,13->xs; 15->base; 17,19,20->lg; 22->xl; 26,28,30->2xl; 32,34,40->3xl; 50->4xl; пары `28px … sm:34px` схлопнуты в `text-3xl` (шкала уже текучая), `md:text-[50px]` у hero убран (`text-4xl` и так 37–49 px). `.form-label` в CSS тоже на `var(--step--2)`. Охранный тест `styles/tokens-usage.spec.ts` не даёт вернуть `text-[Npx]`, `rounded-[…]`/`rounded-md…` и `transition-all`.

**VD1 — высота.** `--shadow-1/2/3` двухслойные, с оттенком hue 221, отдельные значения для тёмной темы; `boxShadow` `elev-1/2/3`. `Card` по умолчанию: `shadow-elev-1` + `border-border-soft` (в тёмной теме `--border-soft` = полная рамка). Диалоги (`Modal` dialog/drawer, `cancel-appointment-dialog`, `revoke-consent-dialog`) — `elev-3`; список подсказок терминологии — `elev-2`; плавающая карточка hero и «ближайший приём» — `elev-2`; активные «пилюли» сегментов — `elev-1`. `cn()` теперь через `extendTailwindMerge`, чтобы `shadow-elev-*` и `duration-*` корректно перекрывали друг друга (тест в `cn.spec.ts`).

**VE1 — движение.** `--ease-out`, `--ease-in-out`, `--duration-fast/base/slow` + `transitionTimingFunction`/`transitionDuration`. Применено только к `button-variants.ts`: `transition-[background-color,color,box-shadow,transform] duration-fast ease-out`, реальные hover-цвета у каждого варианта, `active:scale-[0.97]` (у disabled/aria-disabled отключён), у primary pressed = `primary-strong`. Глобальное правило `prefers-reduced-motion` не тронуто.

## Побочные исправления (нашлись при проверке)
- `bg-inverse/40` в двух диалогах не генерировался Tailwind 3 (opacity-модификатор на `var()`), т.е. подложки не было вообще; теперь `bg-scrim`. `bg-black/30` в `Modal` — тоже `bg-scrim`.
- `bg-secondary/40` в непрочитанных уведомлениях не генерировался; теперь `bg-secondary` (заливка стала заметнее прежнего замысла, при желании подобрать отдельный токен).
- `text-white` на `bg-destructive/success/warning` (счётчик колокольчика, полоса KPI, кнопка опасного действия) заменён на `*-foreground`: в тёмной теме белое на светлом не читалось.

## Итоговая таблица токенов (L C H; alpha указан отдельно)

| Токен | Светлая | Тёмная |
|---|---|---|
| background | 97.5% .003 197 | 20% .017 217 |
| card | 100% 0 0 | 24.5% .022 221 |
| foreground | 25% .026 221 | 93.7% .009 206 |
| muted-foreground | 47% .026 222 | 74.4% .022 212 |
| primary | 51% .088 186 | 69.6% .11 184 |
| primary-hover | 45% .078 186 | 75% .115 184 |
| primary-strong | 39% .068 186 | 80% .11 184 |
| primary-foreground | 100% 0 0 | 22.5% .035 185 |
| primary-soft | 94.6% .016 183 | 32.2% .046 186 |
| primary-soft-hover | 91.5% .026 183 | 36% .052 186 |
| primary-soft-foreground | 42% .071 185 | 84.4% .078 186 |
| secondary / accent | 95.7% .005 197 | 28.7% .026 216 |
| destructive | 50% .178 29 | 74.5% .127 26 |
| destructive-foreground | 100% 0 0 | 22% .05 25 |
| destructive-soft / -soft-hover | 94.8% .02 25 / 91.5% .035 25 | 27.5% .05 25 / 31% .058 25 |
| warning / -foreground / -soft | 50% .127 52 / 100% 0 0 / 95.6% .025 69 | 77.7% .125 61 / 24% .045 63 / 28.8% .043 63 |
| info / info-soft | 48% .135 250 / 94.8% .025 245 | 76% .11 245 / 28.5% .05 250 |
| success / -foreground / -soft | 47.9% .078 161 / 100% 0 0 / 94.5% .018 161 | 77.6% .094 160 / 24% .04 165 / 28.8% .039 165 |
| warm / warm-soft / warm-foreground | 68% .15 40 / 94.5% .032 55 / 45% .12 38 | 75% .13 40 / 29% .05 45 / 84% .09 50 |
| border / border-soft | 91.3% .009 206 / 95% .006 206 | 33% .027 215 / 33% .027 215 |
| input | 62% .02 219 | 60.3% .029 212 |
| ring | = primary | = primary |
| scrim | 25% .026 221 / 0.4 | 10% .02 221 / 0.65 |
| inverse / -foreground / -muted / -border / -accent | 25% .026 221 / 100% 0 0 / 86.7% .014 208 / 37% .029 213 / 84.4% .078 186 | 28.7% .026 216 / 93.7% .009 206 / 74.4% .022 212 / 37% .029 213 / 84.4% .078 186 |
| shadow-1/2/3 | `0 1 2 / .06 + 0 2 8 / .05` … `0 4 8 / .08 + 0 24 56 / .18` (hue 221, L 25%) | те же слои, L 8%, alpha .4/.3 … .5/.65 |
| radius-sm/control/card/panel | 6 / 10 / 16 / 20 px | то же |
| ease-out / ease-in-out | cubic-bezier(.23,1,.32,1) / (.77,0,.175,1) | то же |
| duration fast/base/slow | 120 / 200 / 300 ms | то же |

Контраст (WCAG 2.x, из спека): текст на фоне >= 4.5 во всех парах обеих тем (минимум: `destructive` на `destructive-soft-hover` в светлой 5.05, `muted-foreground` на `secondary` 5.98); `input` против card/background/secondary >= 3.2 светлая, >= 3.67 тёмная; `warm` на card 3.05 (декоративный, не для текста).

## Затронутые файлы (89 изменённых + новые)
Токены и конфиг: `frontend/src/styles/globals.css`, `frontend/tailwind.config.ts`, `frontend/src/styles/globals-contrast.spec.ts`, новый `frontend/src/styles/tokens-usage.spec.ts`.
Тема: новые `frontend/src/lib/theme/theme.ts`, `theme.spec.ts`, `frontend/src/components/layout/theme-switcher.tsx`, `theme-switcher.spec.tsx`, `theme-sync.tsx`; изменены `src/store/use-ui-store.ts`, `src/components/providers.tsx`, `src/app/layout.tsx`, `catalog/public-shell.tsx`, `layout/patient-shell.tsx`, `layout/staff-shell.tsx`, `src/messages/ru.json`, `en.json`, `layout/shells.spec.tsx`, `catalog/public-shell.spec.tsx`.
Примитивы: `ui/button-variants.ts`, `ui/card.tsx`, `lib/ui/cn.ts`, `cn.spec.ts`.
Диалоги/поверхности/цвета: `admin/shared/modal.tsx`, `admin/shared/admin-styles.ts`, `appointments/cancel-appointment-dialog.tsx`, `consent/revoke-consent-dialog.tsx`, `doctor/terminology-combobox.tsx`, `appointments/next-appointment.tsx`, `catalog/home-hero.tsx`, `layout/notification-bell.tsx`, `admin/analytics/appointments-kpis.tsx`, `patient/notifications/notification-row.tsx`, `patient/segmented-tabs.tsx`, `patient/history-timeline.tsx`, `doctor/journal-controls.tsx`.
Замена размеров шрифта и радиусов: ещё ~55 компонентов под `frontend/src/components/**` (механическая замена классов).

## Проверка
В `frontend/`:
- `npm test` — 200 suites, 2182 tests, все зелёные (при первом прогоне параллельно с tsc/lint два теста упали по таймауту 5 с из-за нагрузки; отдельно и при повторном полном прогоне зелёные).
- `npm run lint` — без предупреждений.
- `npx tsc --noEmit` — без ошибок.
- `npm run build` — зелёный, но в этой оболочке `NODE_ENV=development`, и Next 15 тогда падает на `<Html> should not be imported outside of pages/_document` при prerender `/404` (не связано с изменениями). Сборка выполнена с `NODE_ENV=production npm run build`; сборка образа `docker compose up -d --build web` (тот же `next build`) тоже прошла.
- `docker compose up -d --build web` — контейнер `medcenter-web-1` healthy, остальные сервисы не тронуты; inline-скрипт темы присутствует в HTML.

Визуальная проверка (Playwright + установленный Chrome, вход из `demo-manifest.json` без вывода паролей, формы не отправлялись): светлая и тёмная темы, 1440 и 400 px: лендинг, `/doctors`, `/login`, `/booking` (после выбора услуги), `/profile`, `/appointments`, `/doctor/appointments`, `/admin/users` и диалог «Создать пользователя» (открыт и закрыт без отправки). По отчёту скрипта: на всех 36 экранах `data-theme` соответствует, горизонтального переполнения нет, текста < 12 px нет, ошибок консоли нет. Переключатель: system -> клик «Тёмная» -> `data-theme=dark`, `localStorage=dark`, `aria-pressed=true`; после перезагрузки остаётся dark; «Как в системе» следует за ОС (light -> dark при смене `prefers-color-scheme`); «Светлая» перекрывает тёмную ОС; при тёмной ОС атрибут уже стоит на первом `readystatechange` (без вспышки).
Скриншоты: `/tmp/claude-1000/-mnt-BE48B9DF48B9971D-projs-MedCenter/31fd78e6-344a-4349-bf3e-f3639f9779ba/scratchpad/v1/{guest|patient|doctor|admin}-{landing|doctors|login|booking-service|profile|appointments|users|users-dialog}-{light|dark}-{desktop|mobile}.png` (36 файлов), `report.json` рядом, скрипт `visual.spec.ts`.

## Не сделано / сомнительно
- Только токены V1, экраны не переоформлялись: палитра осталась близкой к прежней (расширена тёплым и info, но они пока нигде не применены — это работа следующих задач, VA1 «статусы заливкой + иконка» не затронут). `--warm`, `--info*` в UI пока не используются.
- Текст `text-sm` теперь 13.6–14.2 px (был 14), `text-xs` 12.4–12.6 (был 12), `text-base` 15–16 (был 16), `text-lg` 18–20 (был 18), заголовки крупнее на широких экранах; line-height в ключах заменён на безразмерный, высоты строк слегка изменились. На экранах оценено на глаз, регрессий вёрстки не заметно, но скриншот-тестов нет.
- Публичная шапка на 400 px: переключатель темы переносится на отдельную строку (шапка и так переносится); при необходимости сделать переключатель компактным (одна кнопка-цикл) — отдельное решение.
- `DANGER_BUTTON_CLASS` (админка) всё ещё использует `hover:opacity-90` — по заданию motion применён только к `button-variants.ts`.
- В dev-оболочке `NODE_ENV=development` мешает `npm run build` — нужно `NODE_ENV=production` (или чистое окружение).
- Кросс-вкладочная синхронизация темы (`storage` event) не реализована.
- Временные файлы Playwright лежат только в scratchpad; `frontend/pw-tmp.config.ts` и прочие чужие изменения не затронуты.
