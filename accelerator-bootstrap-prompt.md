# Промпт: развернуть паттерн `Command → Agent → Skill` в существующем проекте

> Скопируй всё, что ниже разделителя, в агента (Claude Code / аналог), запущенного **в корне целевого репозитория**.
> Перед запуском заполни блок `ПАРАМЕТРЫ`. Всё остальное агент определит сам на шаге 0.

---

## ПАРАМЕТРЫ (заполнить)

```yaml
PROJECT_NAME: "<имя проекта>"
PROJECT_PURPOSE: "<2-3 предложения: что это за система и для кого>"
STACK: "<напр. Python/FastAPI + React, или Go + Vue, или .NET + Angular>"
BACKEND_DIR: "<путь, напр. apps/api или src/server или '-' если нет>"
FRONTEND_DIR: "<путь, напр. apps/web или '-' если нет>"
LANGUAGE_OF_DOCS: "English"        # язык всех генерируемых .md
HOOK_MODE: "warn"                   # warn = exit 1 (мягко) | block = exit 2 (жёстко)
SHELL_FLAVOR: "bash"                # bash | pwsh — под ОС команды
```

---

# ЗАДАЧА

Ты — инженер по агентной инфраструктуре. Разверни в **существующем** репозитории воспроизводимый
паттерн агентной разработки `Command → Agent → Skill` с ручным (human-gated) последовательным потоком.

Паттерн состоит из шести слоёв. Реализуй **все шесть**, не пропуская ни одного:

| Слой | Артефакт | Назначение |
|---|---|---|
| 1. Конституция | `AGENTS.md` | Жёсткая политика MUST / MUST NOT + иерархия источников истины |
| 2. Инварианты стиля | `.claude/GOLDEN-PRINCIPLES.md` | Неоспариваемые правила кода (naming, типы, ошибки, тесты) |
| 3. Приёмка | `.claude/DOD.md` | Многоуровневый Definition of Done, каждый пункт проверяем командой |
| 4. Стабилизация | `.claude/STABILIZATION.md` | Цикл «ошибка → правило» из 5 шагов |
| 5. Исполнение | `.claude/skills/`, `.claude/commands/`, `.claude/agents/` | Тройка слоёв: команда спавнит агента, агент исполняет ровно один скилл |
| 6. Принуждение | `.claude/hooks/` + `.claude/settings.json` | Хуки как высшая власть: валидация имён, блок деструктива, детект циклов |

Плюс два хранилища состояния: `tasks/` (временные документы задач) и `specs/` (живые спецификации).

## Ключевые инварианты паттерна — нарушать нельзя

1. **Одна команда = один агент = один скилл.** Агент исполняет свой скилл и **STOP**.
2. **Никакого авточейнинга.** Агент не вызывает другие скиллы и не принимает решений о потоке.
3. **Handoff через файлы, не через контекст.** Состояние живёт в `tasks/TASK-NNN/` и `specs/`,
   поэтому любой шаг перезапускаем в чистом контексте.
4. **Каждый агент завершается двумя блоками:** `Context Summary` (2–3 предложения) и `Next Steps`
   (`Next by flow:` + `Alternatives:`). Решение «идти дальше» принимает пользователь.
5. **Изоляция контекста** — главный диалог остаётся чистым, это защита от галлюцинаций.
6. **Все выходные .md префиксуются именем скилла:** `{skill-name}-{purpose}.md`.

---

# ШАГ 0. Discovery (сначала читать, потом писать)

Не создавай ни одного файла, пока не выполнил разведку. Собери и выведи таблицей:

```bash
ls -a; cat package.json 2>/dev/null || cat pyproject.toml 2>/dev/null || cat go.mod 2>/dev/null
ls .claude 2>/dev/null; cat AGENTS.md CLAUDE.md 2>/dev/null | head -50
git log --oneline -10; git status --short
```

Определи и зафиксируй:

- язык(и), фреймворки, менеджер пакетов, монорепо или нет;
- **реальные** команды `test` / `lint` / `build` / `typecheck` — они пойдут в `DOD.md` дословно;
- фактическую слоистость кода (напр. `router → service → repository`, или `handler → usecase → store`) —
  скилл `coder` пишется под неё, а не под абстрактный NestJS;
- существующие конвенции именования файлов (kebab / snake / Pascal) — `GOLDEN-PRINCIPLES.md`
  фиксирует то, что **уже есть** в репозитории, а не то, что нравится тебе;
- есть ли уже `.claude/`, `AGENTS.md`, `CLAUDE.md` — если да, **дополняй, а не перезаписывай**;
- CI-конфиги (`.github/workflows/*`) — из них берутся команды для уровня `Full` в DoD.

**Стоп-точка №1.** Выведи отчёт разведки + предлагаемый список скиллов и жди подтверждения
пользователя, прежде чем создавать файлы.

---

# ШАГ 1. Целевое дерево

```
AGENTS.md                       # конституция (политика)
README.md                       # человеческая документация паттерна (дополнить существующий)
spec-desc.md                    # шаблон структуры спецификаций
.claude/
├── GOLDEN-PRINCIPLES.md
├── DOD.md
├── STABILIZATION.md
├── settings.json               # team-конфиг: permissions + hooks (в git)
├── settings.local.json         # личные оверрайды (в .gitignore)
├── agents/
│   ├── README.md
│   └── <skill>-agent.md        # по одному на скилл
├── commands/
│   └── <skill>.md              # по одному на скилл
├── hooks/
│   ├── README.md
│   ├── local-context.sh
│   ├── file-naming-validator.sh
│   ├── bash-validator.sh
│   └── loop-detection.sh
└── skills/
    ├── SKILL-FLOW.md           # мастер-диаграмма потока
    ├── moc-understanding.md    # Map of Content: фаза 1
    ├── moc-planning.md         # фаза 2
    ├── moc-execution.md        # фаза 3
    ├── moc-finalization.md     # фаза 4
    ├── moc-utility.md          # внефазовые утилиты
    └── <skill>/
        ├── SKILL.md
        └── references/         # опционально: гайды, чеклисты, примеры
tasks/
├── README.md
└── .task-counter               # одно число: следующий номер задачи
specs/
└── MANIFEST.md                 # индекс спецификаций, читается первым
```

---

# ШАГ 2. Слой 1 — конституция `AGENTS.md`

Создай `AGENTS.md` в корне. Первая строка задаёт тон: *«These are enforceable rules.
Wishes are ignored, constraints are enforced.»*

Обязательные разделы:

1. **Hierarchy of Sources of Truth** — ровно в этом порядке приоритета:
   `1) Enforcement (hooks, CI, linters)` → `2) Policy (этот файл)` → `3) Architecture (specs/)`
   → `4) Operations (.claude/skills/)` → `5) Examples (examples/)` → `6) Documentation (README)`.
2. **File Naming** — префикс скилла для выходных .md; `TASK-001` (zero-padded, 3 цифры);
   документы задач в `tasks/TASK-NNN/`, спеки в `specs/`; запрет непрефиксованных .md
   (исключения: `README.md`, `MANIFEST.md`, `CHANGELOG.md`).
3. **Agent Behavior** — исполнять только свой скилл и STOP; не чейниться; выводить
   Context Summary + Next Steps; не принимать решений о потоке за пользователя.
4. **Code Quality** — под команды из шага 0: тесты и линт до объявления завершённости;
   запрет продолжать с падающими тестами (эскалация в `/debugger`); запрет `--no-verify`;
   запрет force-push / hard-reset / DROP TABLE без явного согласия пользователя.
5. **Context & Documentation** — читать код до изменения; читать `specs/MANIFEST.md` до записи спек;
   проверять `.task-counter` до создания папки задачи; не дублировать информацию между спеками — ссылаться.
6. **Security** — не читать и не коммитить `.env` / `secrets/`; запрет `rm -rf`, `sudo`, `chmod 777`;
   не вносить OWASP Top 10; валидация на границах системы.
7. **Definition of Done** → ссылка на `.claude/DOD.md`.
8. **Style Invariants** → ссылка на `.claude/GOLDEN-PRINCIPLES.md`.

Формулировки — только `MUST` / `MUST NOT`. Никаких «следует», «желательно», «постарайся».

---

# ШАГ 3. Слой 2 — `.claude/GOLDEN-PRINCIPLES.md`

Заголовок-тезис: *«Taste as invariant. Non-negotiable style rules for all generated code.»*

Разделы (наполнение — по фактическим конвенциям из шага 0):
`Naming` (файлы, классы, функции, константы, булевы с префиксом `is/has/can/should`, обработчики `handle*`),
`Type Strictness` (запрет `any` / небезопасных приведений, явные возвращаемые типы у экспортов, immutability),
`Error Handling` (доменные исключения, запрет пустых catch, лог с контекстом, обработка на границах,
внутри — пробрасывать), `Imports` (порядок групп, запрет barrel-импортов, запрет циклов),
`Test Structure` (`should {behavior} when {condition}`, AAA, независимость тестов),
`Code Organization` (один класс на файл, функция ≈ до 30 строк, файл ≈ до 300 строк, early return,
композиция вместо наследования).

Правило: каждый пункт — проверяемое утверждение с примером, а не пожелание.

---

# ШАГ 4. Слой 3 — `.claude/DOD.md`

Три уровня, каждый пункт — чекбокс с **конкретной командой из шага 0**:

- **Minimum (каждая задача):** нет незакоммиченных лишних изменений (`git diff --stat`);
  именование по префиксам; предоставлен Context Summary + Next Steps.
- **Standard (задачи с кодом):** всё из Minimum + тесты + линт + сборка + проверка типов +
  покрытие нового кода хотя бы happy-path + ручная проверка на OWASP Top 10 + самопроверка
  по `GOLDEN-PRINCIPLES.md`.
- **Full (релиз / merge в main):** всё из Standard + зелёный CI (`gh run list --limit 1`) +
  описание PR с test plan + `CHANGELOG.md` + обновлённые спеки + отсутствие нерешённых
  `TODO/FIXME/HACK` (`grep -rn`) + обновлённая пользовательская документация.

Раздел `## How to Use`: команды условны — если инструмента нет, помечать
`N/A — tooling not configured`; при падении — исправить или эскалировать в `/debugger`;
доказательства проверки включать в Context Summary.

---

# ШАГ 5. Слой 4 — `.claude/STABILIZATION.md`

Опиши цикл: `1. ERROR → 2. ROOT CAUSE → 3. RULE → 4. EXAMPLE → 5. ENFORCE`.

- Шаг 2 — типовые причины: размытая инструкция (пожелание вместо ограничения),
  отсутствующий контекст, неверный уровень модели для задачи.
- Шаг 3 — маршрутизация правила: глобальная политика → `AGENTS.md`;
  стилевая конвенция → `GOLDEN-PRINCIPLES.md`; специфика скилла → соответствующий `SKILL.md`.
- Шаг 5 — уровни принуждения: `Hook` (автоматически) / `Skill instruction` (полуавтоматически) /
  `Review checklist` (вручную).

Добавь шаблон нового правила с полями:
`Trigger` / `Root cause` / `Rule (MUST|MUST NOT)` / `Example (Incorrect vs Correct)` / `Enforcement` / `Added: YYYY-MM-DD`.
Заполни 1–2 реальных примера из истории целевого репозитория (найди их в `git log` или в issue),
чтобы файл не был пустым шаблоном.

---

# ШАГ 6. Слой 5 — тройка `Skill` / `Agent` / `Command`

## 6.1 Набор скиллов

Минимально жизнеспособный набор, разбитый по четырём фазам. Переименуй под стек проекта,
но сохрани роли и связи `flow-next`:

| Фаза | Скиллы | Выход |
|---|---|---|
| 1. Understanding | `requirements-analyst`, `brainstorming` | `tasks/TASK-NNN/` |
| 2. Planning | `architect`, `api-designer`, `frontend-design`, `writing-plans` | `specs/` + `tasks/` |
| 3. Execution | `using-git-worktrees`, `coder`, `coder-frontend`, `code-reviewer`, `test-generator`, `systematic-debugger`, `verify` | код + тесты |
| 4. Finalization | `documentation-generator`, `release`, `finishing-branch` | docs, tag, PR |
| Utility (вне фаз) | `reflect`, `skill-creator` | правила, новые скиллы |

Цепочка по умолчанию:
`requirements-analyst → brainstorming → architect → api-designer → frontend-design → writing-plans →
using-git-worktrees → coder | coder-frontend → code-reviewer → test-generator → verify →
documentation-generator → release → finishing-branch`.
В фазе Execution заложи петлю: падение тестов → чтение ошибки → фикс → повтор (максимум 3 раза) →
эскалация в `systematic-debugger`. Линейный поток без петли — дефект.

## 6.2 Шаблон `.claude/skills/<skill>/SKILL.md`

```markdown
---
name: <skill-name>
description: <что делает + когда применять + Triggers on "слово", "слово", "слово".>
phase: understanding | planning | execution | finalization | utility
flow-next: <skill-name>
flow-alternatives: [<skill-name>, <skill-name>]
related: [<skill-name>]
---

# <Skill Title>

## Overview
<1 абзац: что делает скилл в этом проекте>

**Related skills:** <ссылки и когда брать их вместо этого>

## Project Structure Requirement
**CRITICAL:** <куда именно писать файлы в ЭТОМ репозитории — конкретные пути из шага 0>

## Process
<пронумерованные шаги. Каждый шаг — проверяемое действие, не рассуждение>

## Patterns / Examples
<фрагменты кода в конвенциях ЭТОГО проекта>

## File Naming Conventions
<таблица: Type | Pattern | Example>

## Quality Checklist
Before completing, verify against [DOD.md](../../DOD.md):
- [ ] <пункты, специфичные для скилла>
- [ ] File naming uses `<skill-name>-` prefix for any generated docs

---

## Next Steps
After <работа> is complete, STOP and present these options:

**Next by flow:** [[/<next>]] `[context]` - <зачем>. See [[moc-<phase>]] for phase context.

**Alternatives:**
- [[/<alt>]] `[context]` - <зачем>.
```

Правила: `description` пишется под автоматический подбор скилла — включай триггерные слова.
Длинные справочники выноси в `references/*.md` и ссылайся на них, держи `SKILL.md` компактным.

## 6.3 Шаблон `.claude/agents/<skill>-agent.md`

```markdown
---
name: <skill-name>
description: "<когда использовать агента>\n\nExamples:\n\n<example>\nContext: <ситуация>.\nuser: \"<запрос>\"\nassistant: \"I'll use the <skill-name> agent to <действие>.\"\n<Task tool call to <skill-name> agent>\n</example>\n\n<example>\n...\n</example>"
model: sonnet
invokes: <skill-name>
phase: <фаза>
---

# <Title> Agent

## Role
<одно предложение>

## Instructions
1. Use the Skill tool to invoke `<skill-name>` skill
2. Execute the skill completely following its instructions
3. STOP when <работа> is complete
4. Provide structured output (see below)

## Output Format
### Context Summary
[2-3 sentences: files created/modified, approach taken, build/lint/test status]

### Next Steps
**Next by flow:** `/<next> [context summary]` - <зачем>.

**Alternatives:**
- `/<alt> [context summary]` - <зачем>.

## Constraints
- ONLY execute the <skill-name> skill
- DO NOT chain to other skills automatically
- DO NOT make workflow decisions
- STOP after skill completion and output suggestions
```

Правила: `description` обязательно с 2+ блоками `<example>` — по ним агент выбирается.
`model` подбирай по сложности: рассуждающие фазы (architect, debugger, code-reviewer) — старшая модель,
механические (release, verify) — младшая.

## 6.4 Шаблон `.claude/commands/<skill>.md`

```markdown
---
spawns: <skill-name>-agent
phase: <фаза>
flow-next: <skill-name>
flow-alternatives: [<skill-name>]
---

# <Title>

Spawn <skill-name> agent to <действие>.

## Input
$ARGUMENTS

## Instructions

Use the Task tool to spawn a sub-agent:
- **subagent_type:** `<skill-name>`
- **description:** `<краткое описание задачи>`
- **prompt:** `$ARGUMENTS`

The agent will use the <skill-name> skill and suggest next steps when done.
```

Команда — тонкий враппер. Никакой логики в ней быть не должно: только спавн агента.

## 6.5 Навигация: MoC-файлы и `SKILL-FLOW.md`

Создай пять MoC-файлов (`Map of Content`) — по одному на фазу плюс utility:

```markdown
---
title: <Phase> Phase
type: moc
phase: <1..4>
description: <одно предложение>
---

# <Phase> Phase
<абзац: что фаза делает и во что впадает>

## Commands
[[/<command>]] <что делает, какой файл производит, когда применять>.

## Flow
<путь по умолчанию, условия для альтернативных входов>

## Outputs
<конкретные имена файлов>

## Next Phase
Continue to [[moc-<next>]] to <цель>.
```

`SKILL-FLOW.md` — мастер-документ: frontmatter (`title`, `type: index`, `description`),
абзац о том, что каждый скилл останавливается и предлагает следующий шаг, ссылки на все MoC
и ASCII-диаграмма всех четырёх фаз с ветвлением backend/frontend и петлёй фикса тестов.
Внутренние ссылки — только через `[[wiki-links]]`, чтобы граф был связным.

---

# ШАГ 7. Слой 6 — хуки и `settings.json`

Каждый хук: читает JSON инструмента из stdin, извлекает поле POSIX-совместимо
(`sed -n 's/.*"field"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1`, без `grep -P`),
возвращает `0` = пропустить, `1` = предупредить и продолжить, `2` = заблокировать.
Начинай в режиме `HOOK_MODE` из параметров; в шапке каждого скрипта комментарием укажи
тип хука и текущий режим.

| Файл | Событие | Задача |
|---|---|---|
| `local-context.sh` | `SessionStart` | Печатает ветку, число незакоммиченных изменений, менеджер пакетов, доступные скрипты, структуру каталогов, число задач и спек. Всегда `exit 0`. |
| `file-naming-validator.sh` | `PreToolUse: Write\|Edit` | Проверяет `.md` в `tasks/` и `specs/` на префикс скилла. Аллоулист: `README.md`, `CHANGELOG.md`, `MANIFEST.md`. Массив известных префиксов держи в скрипте и **пополняй при каждом новом скилле**. |
| `bash-validator.sh` | `PreToolUse: Bash` | Жёсткий блок (`exit 2`) деструктива: `git push --force`, `git push -f`, `git reset --hard`, `git clean -f`, `git branch -D`, `--no-verify`, `DROP TABLE`, `DROP DATABASE`, `npm publish`, `rm -rf /`, `rm -rf ~`, `rm -rf .`, `gh repo delete`, `gh release delete`, `gh api ... DELETE`. |
| `loop-detection.sh` | `PostToolUse: Edit` | Считает правки на файл за сессию (хеш пути в `/tmp/claude-loop-detection/`). Предупреждение на 7-й правке, блок на 10-й с подсказкой уйти в `/debugger`. |

`chmod +x .claude/hooks/*.sh`. Добавь `.claude/hooks/README.md` с таблицей событий и кодов возврата.

`.claude/settings.json` — команднный конфиг в git:

```json
{
  "env": { },
  "permissions": {
    "allow": ["Read(**)", "Edit(**)", "Write(**)", "Glob(**)", "Grep(**)",
              "Bash(git:*)", "Bash(ls:*)", "Bash(cat:*)", "<команды пакетного менеджера проекта>",
              "WebFetch(domain:<только нужные домены документации>)"],
    "deny": ["Read(.env)", "Read(.env.*)", "Edit(.env)", "Write(.env)",
             "Read(./secrets/**)", "Bash(rm -rf:*)", "Bash(sudo:*)", "Bash(chmod 777:*)"]
  },
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": ".claude/hooks/local-context.sh", "timeout": 10000 }] }],
    "PreToolUse": [
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": ".claude/hooks/file-naming-validator.sh", "timeout": 5000 }] },
      { "matcher": "Bash",       "hooks": [{ "type": "command", "command": ".claude/hooks/bash-validator.sh",       "timeout": 5000 }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit", "hooks": [{ "type": "command", "command": ".claude/hooks/loop-detection.sh", "timeout": 5000 }] }
    ]
  }
}
```

`deny` строится по фактическим секретам проекта (найди их в `.gitignore`).
Создай пустой `.claude/settings.local.json` (`{}`) и внеси его в `.gitignore`.

---

# ШАГ 8. Хранилища состояния

## `tasks/` — временные документы

- `.task-counter` — файл с одним числом: **следующий** свободный номер. Начальное значение `1`.
- `tasks/README.md` — описывает структуру `TASK-NNN/`, состав файлов
  (`requirements-analyst-requirements.md`, `brainstorming-design.md`, `writing-plans-plan.md`),
  правило нумерации (zero-padded 3 цифры) и когда удалять папку (после мержа/деплоя и ревью).
- Добавь в `.gitignore` решение по вкусу проекта: коммитить задачи или нет. Явно зафиксируй выбор.

## `specs/` — живые спецификации

- `specs/MANIFEST.md` — читается **первым** любым агентом. Структура:
  название и назначение проекта (2–3 предложения), таблица
  `Specs Index (File | Purpose | Depends On | Last Updated)`,
  таблица `Implementation Status (Area | State | Notes → ссылка на артефакт)`,
  список `Key Decisions` (auth, БД, фронтенд-стек и т.п.).
- Отдельные файлы по владельцу-скиллу: `architect-architecture.md`, `api-designer-spec.md`,
  `frontend-design-spec.md`, `documentation-generator-implementation.md`.
- Обновления — **append** секциями с префиксом `[TASK-N]`, а не перезапись файла.
- `spec-desc.md` в корне — шаблон структуры спек + **паттерн загрузки по агенту**, например:
  `architect` читает только `MANIFEST.md`; `api-designer` — `MANIFEST.md → architect-architecture.md`;
  `frontend-design` — `MANIFEST.md → architect-architecture.md → api-designer-spec.md`;
  `documentation-generator` — `MANIFEST.md` + все спеки + исходники.
  Смысл: минимизировать токены и не размывать контекст.

---

# ШАГ 9. Документация паттерна

Дополни (или создай) корневой `README.md` разделами:
`Architecture: Command -> Agent -> Skill` с ASCII-диаграммой и списком выгод
(изоляция контекста против галлюцинаций, handoff через Context Summary, поток контролирует пользователь,
главный диалог чистый); `Documentation System` (tasks vs specs, жизненные циклы);
`Quick Reference: Next by Flow` — таблица `Current Command | Next by Flow | Why` по всем скиллам;
`Skills` по фазам; `Agents` (таблица agent → skill → purpose) + раздел
`Key Principle: Stop After Completion`; `Hooks` (таблица событий и кодов возврата);
`Settings`; `Creating New Skills` — пошаговая инструкция из 4 шагов
(каталог скилла → `SKILL.md` с frontmatter → команда → агент).

Первой строкой README поставь: `> For agent policy rules, see [AGENTS.md](AGENTS.md)`.

---

# ШАГ 10. Верификация (обязательна, без неё задача не считается выполненной)

Проверь программно и приложи вывод:

1. **Полнота тройки:** для каждого `X` в `.claude/skills/` существуют `.claude/commands/X.md`
   и `.claude/agents/X-agent.md`. Выведи расхождения.
2. **Целостность графа:** каждый `flow-next` и `flow-alternatives` указывает на существующий скилл;
   каждая `[[ссылка]]` в MoC и `SKILL.md` разрешается в существующий файл или команду.
   Битых ссылок быть не должно.
3. **Согласованность:** `spawns` в команде == имя файла агента; `invokes` в агенте == `name` в `SKILL.md`;
   `phase` совпадает во всех трёх слоях.
4. **Хуки:** `bash -n` на каждом скрипте, бит исполнения выставлен, `settings.json` — валидный JSON
   (`node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json'))"`).
5. **Живой прогон хуков:** прогони `file-naming-validator.sh` на заведомо плохом имени
   (`tasks/TASK-001/notes.md` → должен предупредить/заблокировать) и на хорошем
   (`tasks/TASK-001/coder-summary.md` → `exit 0`). То же для `bash-validator.sh` с `git push --force`.
6. **Префиксы:** массив известных префиксов в `file-naming-validator.sh` покрывает все созданные скиллы.
7. **DoD-команды исполняемы:** каждая команда из `DOD.md` реально существует в проекте
   или помечена `N/A — tooling not configured`.
8. **Смоук паттерна:** запусти первую команду цепочки на маленькой реальной задаче и убедись,
   что агент остановился и выдал `Context Summary` + `Next Steps`, не начав чейниться.

---

# ЧЕГО ДЕЛАТЬ НЕЛЬЗЯ

- Не перезаписывай существующие `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json` — читай и дополняй,
  сохраняя пользовательские правила.
- Не копируй стек-специфичные примеры из чужого проекта (NestJS/TypeORM и подобное), если стек другой.
  Все примеры кода — на фактическом стеке из шага 0.
- Не давай агентам право чейниться «для удобства». Ручной поток — это и есть паттерн.
- Не пиши правила в форме пожеланий. Только `MUST` / `MUST NOT`.
- Не ставь хуки сразу в режим `block`, если пользователь не попросил: сначала `warn`, после обкатки — `block`.
- Не создавай скиллы, которые никто не вызывает из потока: у каждого скилла есть входящая связь
  (`flow-next` откуда-то) либо явная роль utility.
- Не пиши `Read(**)`/`Write(**)` в `allow`, если в репозитории есть секреты вне `.env` — сначала уточни.

---

# ПОРЯДОК РАБОТЫ И СТОП-ТОЧКИ

1. Шаг 0 → **стоп-точка №1**: отчёт разведки + предлагаемый список скиллов, ждать подтверждения.
2. Шаги 2–5 (конституция, принципы, DoD, стабилизация) → **стоп-точка №2**: показать четыре файла,
   ждать правок пользователя, так как это политика, а не код.
3. Шаг 6: создать скиллы фаза за фазой; после каждой фазы — краткая сводка.
4. Шаг 7 (хуки и settings) → **стоп-точка №3**: настройки permissions и блок-листы согласовать явно.
5. Шаги 8–9 (хранилища состояния и документация).
6. Шаг 10: верификация, приложить вывод всех проверок.

Финальный отчёт: дерево созданных файлов, таблица `command → agent → skill → phase → flow-next`,
результаты всех восьми проверок, список сознательно пропущенного с причинами и первая команда,
которую пользователю стоит запустить.
