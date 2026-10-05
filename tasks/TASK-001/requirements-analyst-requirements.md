# Web-приложение «Медицинский центр» — Требования

**TASK-001** · Автор: requirements-analyst · Дата: 2026-10-04

## Overview

Веб-приложение медицинского центра для организации записи на приём и ведения клинической
документации, с тремя ролями: **Пациент**, **Врач**, **Администратор**. Система строится как
**микросервисная** (TypeScript / Node.js / NestJS, клиент React + Next.js, контейнеризация)
и соответствует стандарту **HL7 FHIR** с опорой на национальные справочники **ЦИСЗ**.
Дополнительно требуется расчётно-пояснительная записка (MS Word) и диаграммы (draw.io):
UML use-case, логическая схема БД, структурная схема приложения.

## Source

- Задание: `list_zadanija_ananyev_clinica.docx` (БГТУ, ФИТ, каф. ПИ; дисциплина «Технологии
  разработки веб-приложений»; группа 7; студент Ананьев Р.В.; руководитель Р.В. Котович).
  Тема: Web-приложение «Медицинский центр». Срок сдачи: 15.12.2026.
- Стандарт: HL7 FHIR International. Терминология: МКБ-10 (адаптированная под МЗ РБ) и
  локальные справочники ЦИСЗ — источник `fhir.by` (руководство FHIR в ЦИСЗ, пакет `fhir.by#1.4.463`).
- Политика проекта: `AGENTS.md` (Belarusian clinic → HL7 International only).

## Ключевые архитектурные решения (KDR)

| ID | Решение | Статус |
|----|---------|--------|
| KDR-1 | **Гибридная FHIR-архитектура**: HAPI FHIR (клинические ресурсы) + NestJS-микросервисы (auth, расписание, уведомления), связанные ссылками на FHIR-ресурсы | Подтверждено |
| KDR-2 | **SMART on FHIR** (OAuth2 + scopes `patient/*.read`, `user/*.write`); `auth-service` = OAuth2 authorization server | Подтверждено |
| KDR-3 | **Терминология**: МКБ-10 (адапт. МЗ РБ) + локальные справочники НСИ ЦИСЗ + АТХ (ATC) + UCUM | Подтверждено |
| KDR-4 | **Стек**: TypeScript, Node.js, NestJS; клиент React + Next.js; Docker (микросервисы) | Из ТЗ |
| KDR-5 | **Версия FHIR = R4** (политика AGENTS.md) | Допущение |
| KDR-6 | **Single-tenant**: одна `Organization`; модель допускает расширение | Допущение |
| KDR-7 | **Уведомления**: in-app + email через `Communication`; SMS/push вне объёма | Допущение |
| KDR-8 | **Развёртывание**: Docker Compose; структура готова к Kubernetes | Допущение |
| KDR-9 | **Интеграция сервисов**: синхронный FHIR REST + доменные события (для уведомлений) | Допущение |
| KDR-10 | **Платежи/биллинг**: вне объёма (нет в ТЗ) | Допущение |

> Помеченные «Допущение» решения приняты по рекомендации аналитика и могут быть изменены
> владельцем продукта.

## Глоссарий

- **ЦИСЗ** — централизованная информационная система здравоохранения Республики Беларусь.
- **FHIR** — HL7 Fast Healthcare Interoperability Resources (версия R4 — политика проекта).
- **SMART on FHIR** — профиль OAuth2 для доступа к FHIR-ресурсам через scopes.
- **НСИ ЦИСЗ** — нормативно-справочная информация ЦИСЗ (справочники/ValueSet).
- **МКБ-10** — Международная классификация болезней 10-го пересмотра (адапт. МЗ РБ).
- **АТХ (ATC)** — анатомо-терапевтическо-химическая классификация лекарственных средств.
- **UCUM** — Unified Code for Units of Measure (единицы измерения).

## Функциональные требования (FR)

### Роль «Пациент»

| ID | Требование | Критерий приёмки (FHIR) | Приоритет |
|----|-----------|-------------------------|-----------|
| FR-001 | Аутентификация и авторизация | Сессия SMART on FHIR; актор связан с `Patient` | High |
| FR-002 | Просмотр доступных врачей и услуг | Поиск `Practitioner` + `PractitionerRole` + `HealthcareService` | High |
| FR-003 | Поиск и выбор доступного времени | `Schedule` → `Slot?status=free` (индекс даты/времени) | High |
| FR-004 | Создание записи на приём | `POST Appointment` (`status=proposed` → `booked`); слот → `busy` | High |
| FR-005 | Отмена записи | `Appointment.status=cancelled` + `statusReason` | High |
| FR-006 | Просмотр расписания и истории посещений | `Appointment` / `Encounter?patient=` → `Bundle` | High |
| FR-007 | Просмотр назначений врача | `ServiceRequest`, `CarePlan`, `MedicationRequest` | High |
| FR-008 | Уведомления об изменении статуса записи | `Communication` (recipient=Patient) | Medium |

### Роль «Врач»

| ID | Требование | Критерий приёмки (FHIR) | Приоритет |
|----|-----------|-------------------------|-----------|
| FR-009 | Просмотр расписания и списка пациентов | `Slot` / `Appointment` участника-`PractitionerRole` | High |
| FR-010 | Просмотр истории обращений пациента | `Encounter`, `Condition`, `Observation` по patient | High |
| FR-011 | Оформление результатов приёма | `Encounter(status=finished)` + `ClinicalImpression` | High |
| FR-012 | Постановка диагноза | `Condition` (category=encounter-diagnosis, code=МКБ-10) | High |
| FR-013 | Формирование рекомендаций | `CarePlan` (+`ClinicalImpression.note`) | High |
| FR-014 | Назначение лечения и процедур | `ServiceRequest`, `MedicationRequest`, `Procedure` | High |

### Роль «Администратор»

| ID | Требование | Критерий приёмки (FHIR) | Приоритет |
|----|-----------|-------------------------|-----------|
| FR-015 | Управление пользователями системы | Хранилище пользователей + связь `Patient`/`Practitioner`/`PractitionerRole` | High |
| FR-016 | Управление услугами | CRUD `HealthcareService` | High |
| FR-017 | Управление кабинетами | CRUD `Location` (`physicalType=room`) | High |
| FR-018 | Управление системными настройками | Конфигурация + терминология (`CodeSystem`/`ValueSet`) | Medium |
| FR-019 | Глобальная аналитика и отчёты | Агрегации по `Appointment`/`Encounter` (`Measure`/`MeasureReport`) | Medium |
| FR-020 | Ведение расписания приёма врачей | CRUD `Schedule` + генерация `Slot` | High |
| FR-021 | Аудит действий пользователей | `AuditEvent` (создание/изменение/удаление) | Medium |

## Нефункциональные требования (NFR)

| ID | Требование | Метрика |
|----|-----------|---------|
| NFR-001 | Микросервисная архитектура, независимый деплой | ≥ 6 сервисов, каждый в отдельном контейнере |
| NFR-002 | Стек | TypeScript (strict), Node.js, NestJS; клиент React + Next.js; Docker |
| NFR-003 | Соответствие HL7 FHIR R4 | Ресурсы валидируются против R4; публикуется `CapabilityStatement` |
| NFR-004 | Соответствие терминологии ЦИСЗ | Биндинг справочников по canonical URL; `CodeSystem`/`ValueSet` |
| NFR-005 | Производительность поиска | Поиск слотов/записей < 500 ms (индексирование параметров поиска) |
| NFR-006 | Безопасность | TLS; SMART scopes; RBAC по ролям; компартмент `Patient`; `AuditEvent`; OWASP Top-10 |
| NFR-007 | Наблюдаемость | Структурные логи, health/readiness endpoints, метрики |
| NFR-008 | Локализация | UI ru-BY по умолчанию (задел на en) |
| NFR-009 | Масштабируемость | Stateless-сервисы, горизонтальное масштабирование |
| NFR-010 | Документация | MS Word (ПЗ), draw.io: UML use-case, логическая схема БД, структурная схема |
| NFR-011 | Тестируемость | Покрытие unit/integration/e2e (happy path + ошибки) |

## Бизнес-правила (BR)

- **BR-001** Один слот → не более одного активного `Appointment` (`Slot.status` → `busy`).
- **BR-002** Отменять запись может пациент (свою) или администратор; статус → `cancelled`.
- **BR-003** Результат приёма/диагноз оформляет только врач, ведущий этот `Encounter`.
- **BR-004** Диагноз ставится в контексте `Encounter` и ссылается на `Condition` (МКБ-10).
- **BR-005** Назначения (`ServiceRequest`/`MedicationRequest`) ссылаются на `Condition` и приём.
- **BR-006** Пациент видит только свои данные (компартмент `Patient`).
- **BR-007** Справочники (услуги, кабинеты, пользователи, терминология) ведёт только администратор.
- **BR-008** Приём нельзя оформить для отменённой/несостоявшейся записи (`noshow`).
- **BR-009** Назначение лекарства обязательно использует код АТХ; единицы — UCUM.

## Соответствие HL7 FHIR R4 и терминология

### 7.1 Карта ресурсов FHIR R4

| Понятие (ТЗ) | Ресурс FHIR R4 | Ключевые элементы / примечания |
|--------------|----------------|-------------------------------|
| Пациент | `Patient` | демография, идентификаторы (`identifier`) |
| Врач | `Practitioner` + `PractitionerRole` | роль, специальность, location, healthcareService, availableTime |
| Клиника | `Organization` | контейнер (single-tenant) |
| Кабинет | `Location` | `physicalType=room`, иерархия `partOf` |
| Услуга | `HealthcareService` | `category`/`type`, `specialty`, `availableTime` |
| Расписание врача | `Schedule` | actor → PractitionerRole/Location/HealthcareService; `planningHorizon` |
| Свободное время | `Slot` | `status=free|busy`, `start`/`end`, `schedule` |
| Запись на приём | `Appointment` | `status`(proposed/booked/cancelled/noshow), participants, `serviceType`, `reasonCode` |
| Ответ пациента | `AppointmentResponse` | `participantStatus`(accepted/tentative/declined) |
| Приём (визит) | `Encounter` | `class=AMB`, `status`, participant, location, `period`, `diagnosis` |
| История посещений | `Encounter` (`?patient=`) → `Bundle` | |
| Результат приёма | `ClinicalImpression` (+ `Composition`/`DocumentReference`) | summary, findings |
| Диагноз | `Condition` | `category`, `code`(МКБ-10), `clinicalStatus`, `verificationStatus`, `evidence` |
| Рекомендации / план | `CarePlan` | `activity` → ServiceRequest/MedicationRequest |
| Назначение процедур/исследований | `ServiceRequest` | `intent=order`, `code`, `reasonCode` |
| Назначение лекарств | `MedicationRequest` | `medication`(АТХ), `dosageInstruction`, `reasonCode` |
| Результаты анализов | `Observation` (+ `DiagnosticReport`) | `code`, `valueQuantity`(UCUM), `referenceRange` |
| Уведомления | `Communication` (+ `Subscription`) | `sender`/`recipient`, `payload` |
| Аудит / происхождение | `AuditEvent`, `Provenance` | безопасность |
| Conformance | `CapabilityStatement`, `StructureDefinition` (профили) | публикуется сервисом |

### 7.2 Терминология (решение KDR-3)

| Домен | Кодовая система / справочник | Целевое поле FHIR | Источник |
|-------|------------------------------|-------------------|----------|
| Диагнозы | **МКБ-10** (адапт. МЗ РБ), canonical `https://fhir.by/ValueSet/InternClassificDiseases10` | `Condition.code` | fhir.by |
| Услуги / процедуры / исследования | **Локальные справочники НСИ ЦИСЗ** (ValueSet по canonical URL) | `HealthcareService.type`, `ServiceRequest.code` | fhir.by / сервис терминологии |
| Лекарства | **АТХ (ATC)** + НСИ ЦИСЗ (производители, ЛС) | `MedicationRequest.medication` | WHO / fhir.by |
| Единицы измерения | **UCUM** (`http://unitsofmeasure.org`) | `Observation.valueQuantity`, `Dosage` | HL7 |
| Административные коды | Core ValueSets FHIR R4 (статусы, пол, класс приёма) | `status`, `gender`, `Encounter.class` | HL7 |

**Примечание:** SNOMED CT и LOINC в объём не включены (лицензионные ограничения для РБ);
предусматривается задел на будущее через `ConceptMap`.

## Разбиение задач (Task Breakdown)

### 8.1 Микросервисы

| Сервис | Назначение | Основные FHIR-ресурсы | Технологии |
|--------|-----------|----------------------|-----------|
| `auth-service` | SMART on FHIR authorization server, RBAC, пользователи | (профили безопасности; связь с `Patient`/`Practitioner`) | NestJS, OAuth2 |
| `patient-service` | Пациенты | `Patient`, `RelatedPerson` | NestJS + HAPI клиент |
| `practitioner-service` | Врачи, организация, кабинеты | `Practitioner`, `PractitionerRole`, `Organization`, `Location` | NestJS + HAPI клиент |
| `catalog-service` | Услуги, расписание, слоты | `HealthcareService`, `Schedule`, `Slot` | NestJS + HAPI клиент |
| `appointment-service` | Запись на приём | `Appointment`, `AppointmentResponse` | NestJS + HAPI клиент |
| `encounter-service` | Клинические данные | `Encounter`, `ClinicalImpression`, `Condition`, `ServiceRequest`, `CarePlan`, `MedicationRequest`, `Observation` | NestJS + HAPI клиент |
| `notification-service` | Уведомления | `Communication` | NestJS (события) |
| `analytics-service` | Отчёты/аналитика | `Measure`, `MeasureReport` (read models) | NestJS |
| `fhir-server` | Хранилище клинических ресурсов | все ресурсы FHIR R4 | **HAPI FHIR JPA** + PostgreSQL |

### 8.2 Backend-задачи (на каждый сервис)

- [ ] Модель/DTO (`CreateXDto`, `XResponseDto`)
- [ ] Маппер домен ↔ FHIR-ресурс (`XToFhirMapper`, `FhirToXMapper`)
- [ ] Сервис (`XService`) с бизнес-правилами
- [ ] Контроллер (`XController`) — REST/FHIR-эндпоинты
- [ ] Валидация входных данных (class-validator)
- [ ] Тесты: unit (сервис/маппер) + integration (эндпоинты)

### 8.3 Frontend-задачи (React + Next.js)

- [ ] Страницы аутентификации (вход/регистрация)
- [ ] Каталог врачей и услуг (поиск/фильтры)
- [ ] Экран выбора слота и записи
- [ ] Список/детали записей и история посещений
- [ ] Кабинет врача (приём, диагноз, назначения)
- [ ] Админ-панель (CRUD услуг, кабинетов, пользователей, расписаний)
- [ ] Дашборд аналитики/отчётов
- [ ] Центр уведомлений (in-app)
- [ ] Интеграция с API (клиент FHIR REST / SMART-токены)

### 8.4 Задачи тестирования

- [ ] Unit: сервисы, мапперы (Jest)
- [ ] Integration: FHIR-эндпоинты, валидация ресурсов против R4
- [ ] E2E: сценарии «запись → приём → диагноз → назначение»
- [ ] Тесты безопасности: scopes, доступ к чужим данным (компартмент)
- [ ] Тесты терминологии: биндинг МКБ-10 / НСИ ЦИСЗ / АТХ / UCUM

### 8.5 Артефакты ПЗ (курсовой проект)

- [ ] UML use-case (draw.io)
- [ ] Логическая схема БД
- [ ] Структурная схема приложения (микросервисы)
- [ ] `CapabilityStatement` сервиса
- [ ] Листинги (приложение), руководство пользователя

## Стратегия тестирования

| Уровень | Инструмент | Что проверяем |
|---------|-----------|---------------|
| Unit | Jest | бизнес-логика, маппинг FHIR, валидация |
| Integration | Jest + Testcontainers/супертест | REST/FHIR-эндпоинты, HAPI-интеграция, БД |
| E2E | Playwright/Cypress | сквозные пользовательские сценарии |
| Contract | Валидация FHIR R4 | соответствие ресурсов профилям/ValueSet |
| Security | scopes/RBAC тесты | изоляция по ролям и компартменту |

## Gap Analysis / Открытые вопросы

### 9.1 Закрытые вопросы (по итогам уточнения)

| № | Вопрос | Решение |
|---|--------|---------|
| 1 | Глубина FHIR | Гибрид: HAPI FHIR + NestJS (KDR-1) |
| 2 | Аутентификация/доступ | SMART on FHIR (OAuth2 + scopes) (KDR-2) |
| 3 | Терминология | МКБ-10 (МЗ РБ) + НСИ ЦИСЗ + АТХ + UCUM (KDR-3) |

### 9.2 Допущения (приняты по рекомендации, можно изменить)

- [ ] **A-1** Версия FHIR = R4 (политика AGENTS.md). *Риск:* национальный IG `fhir.by`
  опубликован на базе FHIR 5.0.0 — терминологию подключаем по canonical URL, ресурсы — R4.
- [ ] **A-2** Одна `Organization` (single-tenant).
- [ ] **A-3** Уведомления: in-app + email; SMS/push вне объёма.
- [ ] **A-4** Развёртывание: Docker Compose (готовность к k8s).
- [ ] **A-5** Платежи/биллинг вне объёма.
- [ ] **A-6** Саморегистрация пациента; врачей/админов создаёт администратор.
- [ ] **A-7** Интеграция сервисов: FHIR REST + доменные события.
- [ ] **A-8** Язык UI: ru-BY.
- [ ] **A-9** Интерпретация «системных настроек» (FR-018) = конфигурация + управление терминологией.

### 9.3 Оставшиеся риски

- [ ] **R-1** Лицензии/доступность справочников НСИ ЦИСЗ вне закрытого контура.
- [ ] **R-2** Разница версий FHIR (R4 ресурсы ↔ R5-IG терминология) — требуется проверка биндинга.
- [ ] **R-3** Отсутствие маршрутов врача/пациента «в реальном времени» (расписание) — уточнить у заказчика.
- [ ] **R-4** Объём интеграции с внешним сервисом терминологии ЦИСЗ vs локальная копия справочников.

## Трассируемость (Requirement → Task)

| Требование | Сервис(ы) | Ресурсы FHIR |
|-----------|-----------|--------------|
| FR-001 | auth-service | (Patient/Practitioner) |
| FR-002, FR-016, FR-017 | practitioner-service, catalog-service | Practitioner, PractitionerRole, HealthcareService, Location |
| FR-003, FR-020 | catalog-service | Schedule, Slot |
| FR-004, FR-005, FR-008 | appointment-service, notification-service | Appointment, AppointmentResponse, Communication |
| FR-006 | appointment-service, encounter-service | Appointment, Encounter |
| FR-009 | catalog-service | Schedule, Slot |
| FR-010, FR-011, FR-012, FR-013, FR-014 | encounter-service | Encounter, ClinicalImpression, Condition, CarePlan, ServiceRequest, MedicationRequest |
| FR-015, FR-018 | auth-service | (users, CodeSystem/ValueSet) |
| FR-019 | analytics-service | Measure, MeasureReport |
| FR-021 | все сервисы | AuditEvent |

## Definition of Done (для реализации)

- Минимум: нет незакоммиченных изменений задачи; имена файлов с префиксом скилла; Context Summary.
- Standard: тесты/линт/сборка/tsc проходят; покрытие нового кода; нет OWASP-уязвимостей; self-review по GOLDEN-PRINCIPLES.
- Full: CI зелёный; CHANGELOG обновлён; specs обновлены при изменении архитектуры/API; нет TODO/FIXME.
- Дополнительно для НИР: диаграммы и ПЗ соответствуют реализации; `CapabilityStatement` актуален.

## Next Steps (Suggested)

**Next by flow:** `/brainstorm` `TASK-001` — уточнить требования до конкретного дизайна.
**Alternatives:**
- `/architect` `TASK-001` — перейти сразу к архитектуре (требования достаточно ясны).
- `/writing-plans` `TASK-001` — составить план реализации, если дизайн уже определён.
