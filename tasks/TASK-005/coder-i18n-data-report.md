# coder: английские данные каталога (услуги, врачи)

## Что сделано
- Переводы хранятся в стандартном расширении HL7 FHIR R4 `http://hl7.org/fhir/StructureDefinition/translation` (подрасширения `lang`=en, `content`) на примитивах: `HealthcareService._name`, `._comment`; `Practitioner.name[0]._family`, `._given[i]`, `qualification[0].code._text` и `coding[].\_display`.
- Общий хелпер в `libs/fhir-mappers/src/lib/translation.ts`: `resolveContentLanguage` (Accept-Language, учёт q; en -> en, всё остальное -> ru), `translationExtension`, `translated`. `toDoctorResponseDto(practitioner, lang)` локализует имя и специальность.
- practitioner-service: контроллер читает `Accept-Language`, сервис/маппер принимают язык. Кэша нет.
- catalog-service: то же для услуг; ключ Redis `catalog:services:v3:<lang>:<page>:<size>` (инвалидация по префиксу `catalog:services:` работает). Поиск не кэшируется и идёт по русскому имени.
- DTO создания/обновления: необязательные `nameEn` (<=200) и `descriptionEn` (<=2000), валидируются; пустая строка в PATCH удаляет перевод; если поле не передано, сохранённый перевод остаётся. В ответ добавлены необязательные `nameEn`/`descriptionEn` (аддитивно, чтобы админ видел сохранённый английский текст); `name`/`description` локализуются.
- Seed: английский для 6 услуг, 4 специальностей и 4 врачей (транслитерация). Seed делает `PUT` по детерминированным id, поэтому повторный запуск обновляет существующие ресурсы (проверено: unchanged-or-updated=...).
- Фронтенд: cookie `mc-locale` (пишет `LocaleDataSync` в `providers.tsx`, при смене языка делает `router.refresh()`); RSC читают её через `readServerLocale` и передают `Accept-Language` в `publicApiFetch` (заголовок входит в ключ кэша данных Next); `apiFetch` добавляет `Accept-Language` из `useUiStore`; ключи запросов `services/doctors/doctor` оканчиваются локалью. Админ-список услуг всегда запрашивается с `Accept-Language: ru`; в форму услуги добавлены два необязательных поля (ru.json/en.json).

## Файлы
Бэкенд: `libs/fhir-mappers/src/{index.ts,lib/translation.ts,lib/translation.spec.ts,lib/practitioner.mapper.ts}`; `apps/practitioner-service/src/modules/doctors/{doctors.controller.ts,doctors.service.ts,doctor.mapper.ts,doctor.mapper.spec.ts,doctors.language.spec.ts}`; `apps/catalog-service/src/modules/{cache/redis-cache.service.ts,cache/redis-cache.service.spec.ts,services/services.controller.ts,services/services.service.ts,services/dto/*,services/services.service.language.spec.ts,services/services.controller.language.spec.ts}`.
Seed: `tools/demo-seed/{demo-catalog.ts,demo-resources.ts,demo-resources.spec.ts}`.
Фронт (`frontend/src`): `lib/i18n/{locale.ts,server-locale.ts,locale-cookie.spec.ts,server-locale.spec.ts}`, `lib/server-fetch.ts(+spec)`, `lib/api/{api-fetch.ts,query-keys.ts,api-fetch-auth.spec.ts,query-keys.spec.ts}`, `components/providers.tsx(+spec)`, `components/catalog/catalog-server.ts(+spec)`, `components/admin/services/*`, `components/admin/schedules/use-schedule-pickers.spec.tsx`, `messages/{ru,en}.json`.

## Проверка
- `nx test` + `nx lint`: catalog-service (289 тестов), practitioner-service (166), fhir-mappers (20+) — зелёные.
- `npm run test:tools` 476 passed; `npm run lint:tools` чисто.
- frontend: `npx jest` 2787 passed; `npm run lint` чисто; `npx tsc --noEmit` чисто; `NODE_ENV=production npm run build` успешно.
- Live: `docker compose up -d --build catalog-service practitioner-service web`, `npm run seed:demo`. `curl` с `Accept-Language: en` даёт "Maria Ivanova / Therapist", "Therapist appointment (initial)"; `ru` и `de` — русский. В браузере (Chrome, 1440 px) переключение RU/EN обновляет данные, после reload английский сохраняется (cookie).
- Скриншоты: `/tmp/claude-1000/-mnt-BE48B9DF48B9971D-projs-MedCenter/31fd78e6-344a-4349-bf3e-f3639f9779ba/scratchpad/i18n-data/home-en.png`, `home-ru.png`, `home-ru-initial.png` (viewport 1440x900, не fullPage: на fullPage секции появляются по скроллу). Playwright-браузеры не скачивал, использован системный `/usr/bin/google-chrome`.

## Открытые вопросы
1. Остаются русскими: `typeDisplay` услуги (НСИ), названия кабинетов, данные в записях на приём/расписаниях (appointment/catalog schedule используют имена врачей и услуг, сохранённые/собранные отдельно), поиск врачей/услуг по английскому тексту (HAPI ищет по русским значениям).
2. При первом SSR-рендере с cookie `en` интерфейс на мгновение русский (локаль UI восстанавливается из localStorage после гидрации), данные уже английские.
3. Если admin меняет русское имя врача/услуги, старый английский текст остаётся, пока его не обновят; у врачей нет админ-формы для английских имён (только seed).
4. Транслитерация "Aleksey" (не "Alexey") — на ваше усмотрение.
5. Ничего не закоммичено.
