"""Render owner questions (needsDecision=true findings) into tasks/TASK-006/verify-open-questions.md."""
import glob
import json

IMPLEMENTED_DESPITE_FLAG = {"fe-doctor-04", "fe-admin-05", "be-catalog-05", "fe-admin-03", "be-appointment-09", "be-auth-oauth-08"}
# Duplicates are shown once, under the first id, with the others named in the source line.
DUPES = {"task005-triage-b-13": "be-auth-users-06", "task005-triage-a-T3-01": "be-practitioner-08", "task005-triage-b-14": "be-practitioner-08", "task005-triage-b-25": "fe-patient-04"}
# Questions that came up while implementing (recorded in tasks/TASK-006/progress/).
FROM_IMPLEMENTATION = [
    ("Свободный текст записи и отмены для администратора", "be-appointment-09",
     "Скрывать ли от администратора свободный текст записи в GET /appointments/{id} (6.3) и в ответе отмены (6.4)? ADR-018 D-2 и матрица §0 закрывают для ADMIN только историю и диагнозы (7.4/7.6) и назначения (7.5/7.7). Строки про причину обращения (reason) и причину отмены (cancelReason) там нет, хотя юридический ответ L6 относит причину обращения к сведениям о здоровье.\n\n"
     "Варианты: **А** — скрыть reason, причину отмены оставить (рекомендую: причина отмены чаще организационная, а администратору при отмене нужны кто, когда и к кому); **Б** — скрыть оба текста; **В** — оставить как есть.\n\n"
     "Второй вопрос: принимать ли свободный текст причины отмены от пациента без согласия на ЭМК? Сейчас принимается, хотя reason при записи без согласия не принимается. Варианты: оставить и показать юристу как риск, или без согласия сохранять фиксированный текст."),
    ("Повтор погашенного refresh-токена или кода", "be-auth-oauth-08",
     "Спецификация (§2.1.3, ADR-008/011) говорит, что ротация сессию не закрывает, и не требует отзыва при повторе погашенного refresh-токена или кода авторизации. Сейчас такой запрос просто отклоняется.\n\n"
     "Варианты: **А** — при повторе закрывать всю сессию (как советует RFC 9700), с допуском около 10 с на параллельные вкладки (рекомендую: хранилище токенов теперь в Redis, отзыв видят все сервисы); **Б** — оставить отказ одного запроса."),
    ("Удалять ли старые свободные слоты при перегенерации", "be-catalog-04",
     "Генерация теперь пропускает слоты, которые пересекаются с уже существующими, поэтому двойных слотов больше нет. Но после изменения расписания старые свободные слоты прежней сетки остаются. Их удаление — удаление данных.\n\n"
     "Варианты: **А** — при генерации снимать свободные (не забронированные) слоты, которые не совпадают с новой сеткой, в том же диапазоне дат (рекомендую); **Б** — оставить как есть, администратор удаляет лишнее вручную."),
    ("Доверенный адрес перед Traefik", "infra-tools-03",
     "Чтобы лимиты запросов различали браузеры, Traefik теперь доверяет X-Forwarded-For только от контейнера web (172.31.250.10/32, подсеть edge закреплена), а сервисы — TRUST_PROXY=2. Подтвердите вариант.\n\n"
     "Варианты: **А** — один адрес web, как сейчас (рекомендую); **Б** — вся подсеть edge (шире, доверяет и шлюзу хоста); **В** — только loopback (тогда все браузеры снова видны как один адрес). Работу проверю на живом стенде."),
]
SECTIONS = [
    ("ТЗ: администратор", ["tz-matrix-08", "tz-matrix-09", "tz-matrix-10", "be-auth-users-02", "be-auth-users-06", "task005-triage-b-13", "be-catalog-09", "be-catalog-10", "task005-triage-a-V2T2-01", "task005-triage-a-V2T2-02", "task005-triage-a-V2T2-03", "task005-triage-b-07"]),
    ("ТЗ: врач", ["be-encounter-02", "be-encounter-09", "be-encounter-08", "be-patient-01", "task005-triage-a-T1-02", "task005-triage-a-T4-01", "task005-triage-a-T4-02", "task005-triage-a-T4-06", "task005-triage-a-T4-07", "task005-triage-b-06"]),
    ("ТЗ: пациент и каталог", ["tz-matrix-12", "be-appointment-08", "task005-triage-a-T3-04", "be-practitioner-08", "task005-triage-a-T3-01", "task005-triage-b-14", "task005-triage-b-15", "task005-triage-b-17", "task005-triage-a-T3-03", "task005-triage-b-02", "task005-triage-b-03"]),
    ("Аналитика", ["be-analytics-05", "task005-triage-b-21", "task005-triage-b-22", "task005-triage-b-23"]),
    ("Платформа, безопасность, данные", ["be-auth-oauth-11", "infra-tools-09", "task005-triage-a-T3-05", "task005-triage-b-04"]),
    ("Интерфейс и локализация", ["fe-patient-04", "task005-triage-b-25", "contract-02", "i18n-05", "task005-triage-a-V2bV3-01", "task005-triage-a-V2bV3-03", "task005-triage-b-28", "task005-triage-b-30", "task005-triage-b-34"]),
]
items = {}
for f in glob.glob("tasks/TASK-006/findings/*/*.json"):
    d = json.load(open(f, encoding="utf-8"))
    items[d["id"]] = d
questions = {k: v for k, v in items.items() if v.get("needsDecision") and k not in IMPLEMENTED_DESPITE_FLAG and k not in DUPES}
dupes_of = {}
for d, primary in DUPES.items():
    dupes_of.setdefault(primary, []).append(d)
placed = set()
out = ["# TASK-006 — вопросы владельцу", "",
       "Собраны во время шлифовки продукта (2026-11-03, обновлено 2026-11-04 после реализации). Включены вопросы из TASK-005 (`tasks/TASK-005/verify-open-questions.md`), которые ещё открыты. Ответ можно дать номером и вариантом, например «3 — вариант Б».",
       "У каждого вопроса — рекомендация. Источник — файл находки в `tasks/TASK-006/findings/<юнит>/<id>.json`.", ""]
n = 0
out += ["## Возникли при реализации", ""]
for title, src, text in FROM_IMPLEMENTATION:
    n += 1
    out += [f"### {n}. {title}", "", text, "", f"_Источник: `{src}`, `tasks/TASK-006/progress/`_", ""]
for title, ids in SECTIONS:
    sec = [i for i in ids if i in questions]
    if not sec:
        continue
    out += [f"## {title}", ""]
    for i in sec:
        n += 1
        q = questions[i]
        placed.add(i)
        out += [f"### {n}. {q['title']}", "", (q.get("decisionQuestion") or q.get("description") or "").strip(), "",
                f"_Источник: `{i}`" + "".join(f", `{d}`" for d in dupes_of.get(i, [])) + (f"; {q['tzRef']}" if q.get("tzRef") else "") + "_", ""]
rest = [i for i in sorted(questions) if i not in placed]
if rest:
    out += ["## Прочее", ""]
    for i in rest:
        n += 1
        q = questions[i]
        out += [f"### {n}. {q['title']}", "", (q.get("decisionQuestion") or q.get("description") or "").strip(), "", f"_Источник: `{i}`_", ""]
resolved = sorted(k for k, v in items.items() if str(v.get("title", "")).startswith("RESOLVED"))
out += ["## Вопросы TASK-005, которые уже закрыты в коде", ""]
out += [f"- `{k}` — {items[k]['title'].replace('RESOLVED', '').lstrip(':  (').strip()}" for k in resolved]
out += [""]
open("tasks/TASK-006/verify-open-questions.md", "w", encoding="utf-8").write("\n".join(out))
print("questions:", n, "resolved:", len(resolved), "unplaced:", rest)
