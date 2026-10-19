# code-reviewer: запись на приём, каталог и вход (фронтенд)

Источник: результат агента `review:booking` в воркфлоу `wf_795360ca-75f`. Агент вернул замечания только в результате, файлом их не записал; оркестратор сохранил их здесь без изменений.

Вердикт: `request-changes`. Замечаний: 26.

Исправления: раздел «9. Исправления по ревью» в `coder-frontend-booking-report.md`.

## 1. [Существенно] Список слотов строит Intl.DateTimeFormat на каждый слот и не мемоизирует группировку: ~70 мс на каждый рендер

Файл: `frontend/src/components/booking/slot-time.ts`

slot-time.ts:62-107, slot-day-list.tsx:32-83 и lib/utils.ts:13 (minskDateKey) создают новый Intl.DateTimeFormat при каждом вызове: formatSlotTime в каждой плитке, minskDayOf внутри groupSlotsByDay для каждого слота, formatDayHeading на каждый день. SlotDayList вызывает groupSlotsByDay(slots) без useMemo на каждый рендер, а выбор слота (selectedSlotId) перерисовывает весь список. Замер (node, 300 слотов = 14 дней по 16 приёмов в день): 300 minskDateKey = 43 мс, 300 formatSlotTime = 25 мс, то есть ~70 мс на каждый клик по слоту на десктопе; на среднем телефоне это 200-350 мс (INP «требует улучшения»). Исправление: кэш форматтеров на уровне модуля (Map по locale и виду), useMemo(() => groupSlotsByDay(slots), [slots]), React.memo для SlotTile со стабильным onSelect. Добавить тест на то, что форматтер не создаётся повторно (или бенчмарк-проверку на 300 слотах).

## 2. [Существенно] После отказа в записи (SLOT_CONFLICT, gone, mismatch) фокус падает на body: клавиатурный пользователь теряет позицию (WCAG 2.4.3)

Файл: `frontend/src/components/booking/use-step-focus.ts`

Нажатая «Подтвердить запись» находится в ConfirmStep, который размонтируется при releaseSlot() (step 4 → 3). useStepFocus(step, quiet) намеренно ничего не фокусирует, когда booking.notice !== null (booking-wizard.tsx:58, use-step-focus.ts:15-17), поэтому document.activeElement становится <body>. Тест booking-wizard-conflict.spec.tsx:78-87 утверждает только, что заголовок НЕ в фокусе, то есть закрепляет потерю фокуса. Тот же класс дефекта в ревью кабинета (фокус на body) был признан существенным. Исправление: в SlotStep при notice !== null фокусировать сам контейнер role=alert (tabIndex={-1}, slot-step.tsx:30-37): сообщение объявляется как раньше, а позиция сохраняется. Переписать тест на expect(notice).toHaveFocus(). Аналогично кнопка disabled на время pending может потерять фокус в Firefox: держать фокус на кнопке через aria-disabled вместо disabled.

## 3. [Существенно] Границы полей ввода имеют контраст 1.3:1 с фоном (WCAG 1.4.11, AA): токен --input из спеки §0 нарушает §7

Файл: `frontend/src/styles/globals.css`

INPUT_CLASS (components/patient/form-field.tsx:24), doctor-filter-bar.tsx:10, slot-period-control.tsx:39 рисуют границу полей цветом --input = #e5e2d9 на белом/#faf9f6 фоне. Расчёт: L(#e5e2d9)=0.76, отношение к #ffffff = 1.30:1, к #faf9f6 ≈ 1.25:1; для идентификации компонента нужно 3:1. У полей нет другого визуального признака границы (заливка тоже белая), поэтому слабовидящий не находит поле регистрации, причины записи, фильтров и даты. axe этого правила не проверяет, поэтому «0 нарушений» в отчёте не опровергает находку. Корень: общий токен (core) и спека §0 (гайдлайн «волосяные линии»). Исправление в core: отдельный токен границы управляющих элементов ≥3:1 (например #8a8a80 ≈ 3.3:1) для input/select/textarea, волосяной --border оставить для карточек и разделителей. Затрагивает все области, область booking лишь первой это показывает.

## 4. [Незначительно] Кнопка «Позже» не ограничена: после ~27 нажатий сервер отвечает 400 и показывается сырой VALIDATION_ERROR

Файл: `frontend/src/components/booking/use-slot-window.ts`

goForward (use-slot-window.ts:26) всегда сдвигает окно на 14 дней, а кнопка (slot-period-control.tsx:28) никогда не отключается. Сервер принимает from не дальше 366 дней вперёд (MAX_SLOT_LOOKAHEAD_DAYS, slot-range.ts). Проверено на живом стеке: 28 нажатий «Позже» на странице врача дают период «15 нояб. — 28 нояб.» (2027) и баннер «range: from must be within 366 days from today / VALIDATION_ERROR». Горизонт расписания всего 90 дней, поэтому уже через 7 нажатий список пуст без пояснения. Исправление: ограничить окно сверху тем же JUMP_HORIZON_DAYS, что и поле даты (shiftDay(today, 365)), отключать «Позже» на границе, добавить тест (сейчас нет теста на верхний предел).

## 5. [Незначительно] Спека §5.4 RATE_LIMITED: «disable submit на период Retry-After» не реализовано в регистрации и подтверждении записи

Файл: `frontend/src/components/auth/use-register-form.ts`

Тост и текст «повторите через N с» есть (core error-effects и ProblemBanner), но кнопка отправки блокируется только на время запроса: register-form.tsx:82-84 (disabled={state.isPending}) и confirm-step.tsx:77-92 (disabled={isPending}). После 429 пользователь может сразу жать повторно и получать новые 429. В area-тестах нет ни одного случая RATE_LIMITED и ни одного случая сетевой ошибки (status 0) для POST /auth/register и POST /appointments. Исправление: общий хук useRetryCooldown(problem.retryAfter) в lib (аддитивно) и disabled на период; тесты на 429 с Retry-After и на status 0 с повтором под тем же Idempotency-Key.

## 6. [Незначительно] На /login и /register нет переключателя языка (спека §7), хотя (auth)/** принадлежит области

Файл: `frontend/src/app/(auth)/layout.tsx`

Отчёт реализатора относит это к «не моей зоне», но app/(auth)/layout.tsx (строки 5-13) находится в списке владеемых путей. Спека §7: «переключатель в шапке». Пользователь с английским интерфейсом, пришедший на /login без сохранённого языка, не может его сменить; статические metadata.title страниц (login/page.tsx:6, register/page.tsx:4) остаются русскими. Исправление: добавить LocaleSwitcher в карточку (components/layout/locale-switcher уже есть) и тест рядом с layout.spec.tsx.

## 7. [Незначительно] parseFhirId пропускает «.» и «..», сервер такие id отклоняет: /doctors?serviceId=.. показывает «Не удалось загрузить список врачей»

Файл: `frontend/src/components/catalog/doctor-directory.ts`

Клиентский FHIR_ID_PATTERN (doctor-directory.ts:15) = /^[A-Za-z0-9\-.]{1,64}$/, серверный (apps/*/validation-patterns.ts) = /^(?!\.+$)[A-Za-z0-9\-.]{1,64}$/. Проверено на живом стеке: GET /doctors?serviceId=.. отдаёт баннер «Не удалось загрузить список врачей» (API ответил 400), а не отброшенный параметр. Комментарий над parseFhirId обещает «safe to put into an API path»: encodeURIComponent не кодирует точки, поэтому /api/v1/doctors/.. схлопывается в /api/v1/. Кроме того, doctors/[doctorId]/page.tsx:15 передаёт сырой params.doctorId в loadDoctor без parseFhirId. Исправление: добавить (?!\.+$) в шаблон, применять parseFhirId на странице врача, тест на '.' и '..'.

## 8. [Незначительно] Частичный отказ каталога на главной выглядит как «каталог пуст»; на главной грузится 100 врачей ради четырёх карточек

Файл: `frontend/src/app/(public)/page.tsx`

page.tsx:12-18: services={services.ok ? services.data : []}, а isFailed только когда упали оба запроса. Если /services вернул 5xx, а /doctors нет, пользователь видит «Каталог услуг пока пуст.» (messages: home.servicesEmpty) вместо баннера с повтором (спека §C.1: «Ошибка сети: ProblemBanner + retry»). Нет теста на частичный отказ (home-view.spec.tsx проверяет только пустой список и полный отказ). loadDoctors() без pageSize тянет до 100 врачей (CATALOG_PAGE_SIZE), показывается HOME_DOCTORS=4 (home-view.tsx:12,47): передать { pageSize: 4 }. Аналогично wizard-шаги загружают по 100 без индикации усечения.

## 9. [Незначительно] Несуществующий врач отдаётся со статусом 200 (soft 404); заголовок страницы не содержит имени врача

Файл: `frontend/src/app/(public)/doctors/[doctorId]/page.tsx`

Строка 18: return <DoctorNotFound /> без notFound(). Проверено curl: GET /doctors/does-not-exist отвечает 200 с текстом «Врач не найден». Поисковики индексируют такие страницы, мониторинг не видит 404. Спека §5.4 (NOT_FOUND → NotFoundState). Исправление: notFound() из next/navigation и not-found.tsx с DoctorNotFound; generateMetadata с именем врача вместо статичного «Врач — МедЦентр» (строка 7). Сообщение об отказе API здесь использует namespace catalog.loadError «Не удалось загрузить список врачей» (строка 19) для страницы одного врача: нужен свой ключ.

## 10. [Незначительно] <Link> на route handler /api/auth/authorize: prefetch в production запускает побочный эффект (cookie mc_pkce)

Файл: `frontend/src/components/auth/register-form.tsx`

Строка 33: <Link href={LOGIN_HREF}> ведёт на GET-обработчик, который создаёт PKCE-пару, ставит httpOnly cookie и отвечает 302 на другой origin (authorize/route.ts). next/link в production префетчит ссылки в области видимости, а Set-Cookie из промежуточного 302 браузер применяет даже при отказе CORS: параллельный вход в другой вкладке получит чужой verifier. В login-entry.tsx:30 и register-form.tsx:20 для того же URL уже используется <a>. Проверить можно только в next start (в dev префетча нет). Исправление: <a> либо prefetch={false}; константу LOGIN_HREF вынести и использовать в login-entry (сейчас строка собирается в двух местах).

## 11. [Незначительно] Дата рождения в будущем проходит и клиент, и сервер: <form noValidate> отключает атрибут max

Файл: `frontend/src/components/auth/register-schema.ts`

register-schema.ts:21 проверяет только календарную корректность (isCalendarDate); ограничение max={minskDateKey()} (register-form.tsx:50) не работает при noValidate (строка 74) и при ручном вводе. Сервер (RegisterPatientDto, validation-patterns.ts) будничной проверки на будущую дату тоже не делает, поэтому в FHIR Patient попадёт birthDate=2099-01-01. Исправление на клиенте: .refine(date <= minskDateKey()) с сообщением validation.dateFuture в обоих языках и тест; замечание бэкенду: добавить проверку в RegisterPatientDto.

## 12. [Незначительно] После успешной регистрации фокус теряется: форма заменяется панелью role=status

Файл: `frontend/src/components/auth/register-form.tsx`

Строка 72: if (state.isSuccess) return <RegisterSuccess />. Кнопка отправки, где был фокус, размонтируется, фокус уходит на body; живая область role=status, вставленная уже с содержимым, объявляется ненадёжно. Исправление: переносить фокус на h1 успеха (tabIndex={-1}) через эффект, как это сделано для шагов мастера (use-step-focus); добавить тест на фокус.

## 13. [Незначительно] Дублирование констант и схем: REASON_MIN/REASON_MAX, вторая zod-схема регистрации, пятая копия форматирования Europe/Minsk, импорт FormField из чужой области

Файл: `frontend/src/components/booking/book-appointment.ts`

book-appointment.ts:12-13 заново объявляет REASON_MIN=3/REASON_MAX=500, уже экспортируемые из lib/contracts.ts (их берёт cancel-reason-schema кабинета). register-schema.ts описывает registerFormSchema, а lib/contracts.ts содержит registerPatientSchema; тест паритета lib/contracts-boundary.spec.ts проверяет вторую (нигде не используемую в форме), а настоящую форму проверяет только register-schema.spec.ts: паритет «поле/правило» из спеки §5.3 разорван. slot-time.ts:9,16 заводит собственные CLINIC_TIME_ZONE и LOCALE_TAG (ещё одна копия к тем, что перечислены в ревью кабинета). confirm-step.tsx:7 и register-form.tsx:5 импортируют FormField/INPUT_CLASS из components/patient (область кабинета); components/catalog/catalog-api.ts и use-catalog.ts импортируют тип SlotWindow из components/booking, а booking импортирует catalog: цикл на уровне каталогов (на уровне модулей только type-импорты). Рекомендация: общий lib/format/datetime.ts и components/forms/form-field после слияния областей.

## 14. [Незначительно] Отказ «mismatch» не помечает слот как занятый: тот же слот предлагается снова; после отказа окно периода сбрасывается на сегодня

Файл: `frontend/src/components/booking/use-booking-submit.ts`

outcomeFor (строки 56-57) для 'mismatch' возвращает takenSlot=null, поэтому после releaseSlot() неподходящий слот остаётся выбираемым и цикл «выбрал, 400, выбрал» возможен; подсказка не говорит, какой слот чужой. SlotStep получает initialFrom только из selectedSlotStart (slot-step.tsx:60), а releaseSlot() обнуляет slotStart: после отказа на слоте третьей недели пользователь возвращается к первым 14 дням, а отказанный слот withTakenSlot (slot-list.ts:18-21) дописывает в список вне окна, под собственным днём. Исправление: хранить день отказанного слота для initialFrom и помечать takenSlot и для mismatch (с другой подписью).

## 15. [Незначительно] Замечание бэкенду: SlotResponseDto (5.2.8) без serviceId заставляет клиента угадывать услугу по длительности

Файл: `specs/api-designer-spec.md`

Слот несёт scheduleId, но не serviceId; клиент фильтрует по defaultDurationMin услуги (slot-list.ts:12-15). Если у врача две услуги одной длительности или расписание создано со slotDurationMin, не равным длительности услуги, мастер либо скрывает валидные слоты («Нет времени для выбранной услуги»), либо предлагает слоты чужой услуги, а ошибка видна только после POST (400). Предложение: добавить serviceId в SlotResponseDto или фильтр ?serviceId= в 5.2.8. Прочие замечания: DoctorResponseDto не отдаёт код специальности, поэтому GET /doctors?specialty= (токен) нельзя использовать, фильтр и пагинация /doctors сделаны в памяти на 100 врачах; POST /auth/register при занятом email отдаёт CONFLICT с EMAIL_TAKEN в detail, а спека §2.2.6 говорит VALIDATION_ERROR (клиент терпит оба); публичный GET /services отдаёт услуги с isActive=false без фильтра, а UI (service-step.tsx, service-grid.tsx) поле isActive игнорирует (сейчас недостижимо через API, DTO создания и изменения не умеют isActive).

## 16. [Незначительно] E2E сценарии A и A2 (спека §6, NFR-011) остаются test.fixme со старыми селекторами

Файл: `frontend/e2e/booking-flow.spec.ts`

booking-flow.spec.ts:15-20 ожидает ссылку «Записаться» и booking-success, booking-conflict.spec.ts:10-14 ищет slot-conflict-toast с aria-live=assertive; реальные имена: 'Записаться на …', role=alert slot-conflict-notice, тост из Toaster. Сценарии пройдены только вручную. Вне владеемых путей, передать на шаг test-generator: A (гость → слот → вход → восстановленный черновик → 201), A2 (409 → остаёмся на шаге слота, слот отрисован занятым), плюс 429 на регистрации.

## 17. [Незначительно] Качество тестов: часть утверждений отрицательные, есть пробелы в покрытии ветвей

Файл: `frontend/src/components/booking/booking-wizard-conflict.spec.tsx`

1) booking-wizard-conflict.spec.tsx:78-87 и booking-wizard.spec.tsx:98-104 проверяют только not.toHaveFocus() и не говорят, где фокус на самом деле. 2) login/page.spec.tsx:28-32 «не выводит сырой код» проходит тривиально (страница вообще не печатает код). 3) Нет тестов: RATE_LIMITED и status 0 при записи/регистрации; верхний предел «Позже»; частичный отказ главной (services упал, doctors нет); COMPARTMENT_VIOLATION как 'gone'; повторный выбор слота после mismatch; смена причины после серверной ошибки reasonError (сообщение остаётся до следующей отправки, confirm-step.tsx/use-booking-submit.ts:117); подсказка isEmailTaken остаётся после правки email (use-register-form.ts:50-53). Остальные тесты проверяют реальное поведение (тело POST, заголовок Idempotency-Key при ретрае, 409 → тост, refetch и drawn-as-taken, восстановление черновика), имена все в форме should … when … (проверено AST-скриптом: 223 из 223).

## 18. [Незначительно] Мёртвая функция: глубокая ссылка /booking?doctorId= нигде не генерируется и стирает текущий черновик

Файл: `frontend/src/components/booking/use-draft-repair.ts`

booking/page.tsx:12-16 (parseFhirId), use-draft-repair.ts:20-21 и draftForDoctor (booking-steps.ts:46-48) обслуживают ссылку, которую в приложении не создаёт ни один компонент (grep по doctorId= в src: только комментарии), в спеке её нет. Побочный эффект: любая внешняя ссылка /booking?doctorId=X молча заменяет чужой незавершённый черновик вместе с причиной обращения. YAGNI: удалить или оформить как реальную кнопку на карточке врача (спека §3 допускает «Записаться» без слота) с тестами.

## 19. [Мелочь] На мобильной ширине будущие шаги для скринридера называются только номером

Файл: `frontend/src/components/booking/booking-stepper.tsx`

Строки 24 и 37: подпись не текущего шага скрыта hidden sm:inline (display:none), а у будущего шага нет aria-label, поэтому в списке читается «3», «4» без названия. Исправление: sr-only на подписи вместо display:none или aria-label на элементе; для шагов-кнопок aria-label уже есть.

## 20. [Мелочь] Каждый день слотов становится landmark region (до 14 на странице); слоты — сотни tab-остановок

Файл: `frontend/src/components/booking/slot-day-list.tsx`

Строка 63: <section aria-label=…> с h3 внутри делает секцию именованной областью; 14 регионов засоряют список ориентиров. Нужен <section aria-labelledby> либо <div> с заголовком без aria-label. Для 200+ слотов (14 дней по 16) стоит рассмотреть roving tabindex (radiogroup) или возможность пропустить день.

## 21. [Мелочь] clearDraft() вызывается до перехода мутации в success: возможен кадр с шагом 1 перед BookingSuccess

Файл: `frontend/src/components/booking/use-booking-submit.ts`

Строки 99-103: store обновляется синхронно (zustand → useSyncExternalStore, перерисовка в микротаске), а mutation.data становится известной только после await onSuccess и макрозадачи уведомления TanStack, поэтому created === null на один рендер и StepView рисует шаг 1. Не проверено в браузере (по коду: вероятно один кадр). Исправление: чистить черновик в эффекте при created !== null или после router.push.

## 22. [Мелочь] Черновик с причиной обращения переживает отозванную сессию и достанется следующему аккаунту в той же вкладке

Файл: `frontend/src/lib/auth/session-client.ts`

Строки 117-122: endRevokedSession намеренно сохраняет черновик (чтобы вернуться к записи после входа), но sessionStorage вкладки не знает, чей он. Если в этой вкладке войдёт другой пациент, он увидит «Черновик записи восстановлен» с чужой причиной (медданные). Предложение: хранить в черновике идентификатор владельца (patientRef или хеш sub) и сбрасывать при несовпадении после входа. Узкий сценарий, оставляю на усмотрение.

## 23. [Мелочь] next.revalidate: 300 не действует на страницах с dynamic='force-dynamic'

Файл: `frontend/src/lib/server-fetch.ts`

server-fetch.ts:23 просит кэш данных на 300 с, но (public)/page.tsx:9, doctors/page.tsx:9 и doctors/[doctorId]/page.tsx:9 объявляют force-dynamic, что по документации Next отключает кэш fetch (revalidate:0). Комментарий в файле про ISR устарел, а каждый показ главной делает два запроса к API (кэш на стороне API в Redis спасает). Либо убрать force-dynamic и оставить revalidate, либо убрать мёртвую опцию.

## 24. [Мелочь] Водопад: слоты не запрашиваются, пока не придёт услуга; useService не использует список услуг из кэша

Файл: `frontend/src/components/booking/slot-step.tsx`

Строки 44-52: waitingForService не монтирует SlotPicker, пока GET /services/{id} в статусе pending. В обычном потоке услуга уже в кэше из DoctorStep, но при восстановленном черновике на шаге 3 запросы идут друг за другом. useService (use-catalog.ts:18-25) использует ключ services({id}), а не ищет запись в уже загруженном services(): можно initialData из списка и параллельный запрос слотов с фильтром, применяемым после ответа.

## 25. [Мелочь] Золотые принципы: имена булевых и обработчиков, шеринг тестовых хелперов в src, подписка на весь store

Файл: `frontend/src/components/booking/slot-day-list.tsx`

Булевы без префикса is/has/can/should: selectable, taken, selected (slot-day-list.tsx:35-37), touched (confirm-step.tsx:52), quiet (use-step-focus.ts:11), waitingForService (slot-step.tsx:44). Обработчики без префикса handle: goTo, choose (booking-wizard.tsx:25,60). booking-test-utils.tsx лежит в src/components/booking без .spec и типизируется с тестовыми импортами; лучше __tests__/ или test-utils/ вне production-дерева. booking-wizard.tsx:55 и confirm-step: useBookingDraftStore() без селектора подписывает всё дерево мастера на каждое нажатие клавиши в поле причины (плюс запись в sessionStorage на каждое нажатие; ключ идемпотентности сбрасывается при любом изменении reason, включая пробел).

## 26. [Мелочь] Информационно: результаты проверок ревьюера и сильные стороны (действий не требует)

Файл: `frontend/src/components/booking/booking-test-utils.tsx`

Выполнено мной в /mnt/BE48B9DF48B9971D/projs/MedCenter/frontend: npx tsc --noEmit — 0 ошибок; npx jest по (public), (auth), (patient)/booking, components/{booking,catalog,auth}, lib/auth, lib/i18n — 45 наборов, 476 тестов зелёные; jest src/store и src/lib/api — 17 наборов, 202 теста зелёные; npx next lint по всем владеемым каталогам и src/lib/auth — чисто. AST-скрипты: функций длиннее 30 строк в нежпек-файлах нет, any и non-null ! нет, файлы ≤ 200 строк, 223 из 223 названий тестов в форме should … when …; все i18n-ключи области (включая динамические) есть в ru и en. Живой стек (agent-browser, гостевая сессия review-booking-code, закрыта; вход и данные не менялись): подтверждены «Позже» → 400, serviceId=.. → баннер, soft-404 200, два skip-link на странице; опровергнута гипотеза о залипшем значении фильтра после «Сбросить» (поле очищается). Сильные стороны: контракт API (пути, from/to, {items, meta}, Idempotency-Key на намерение и повтор под тем же ключом, patient не отправляется), классификация отказов записи по errorCode с возвратом на шаг слота и отрисовкой занятого слота, черновик в sessionStorage с очисткой при выходе, паритет правила пароля с IsStrongPassword (проверено по DTO), защита returnTo, URL-состояние фильтров, пагинация ссылками без JS, компонент ProblemBanner с реальным requestId, нет dangerouslySetInnerHTML, токенов в хранилищах и console-вывода.
