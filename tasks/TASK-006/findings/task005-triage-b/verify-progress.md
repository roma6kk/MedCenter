Status: done

Examined:
- All 36 open questions of tasks/TASK-005/verify-open-questions.md sections T6 (5), T5+V6 (8), T7+V5 (8), T8 (7), V4+T9 (8), each classified A (plain bug) / B (owner decision) / C (RESOLVED) with code evidence.
- Findings 01-36 written (one file each). A (needsDecision=false, real work): 01 doctor name order + patronymic in catalogue, 05 spec routes stale, 18 slots filtered by duration not service, 20 e2e login never run, 24 report/audit dates read as UTC days, 31 theme-switch transition flash, 32 repeated loading status regions, 33 patient search no retry, 36 glass contrast test/alpha. B (needsDecision=true): 02, 03, 04, 06, 07, 13 (no password change at all, medium), 14, 15, 17, 21, 22, 23, 25, 28, 30, 34. C (RESOLVED): 08, 09, 10, 11, 12, 16, 19, 26, 27, 29, 35.
- Skim of tasks/TASK-005/browser-verify-ux-audit-report.md and frontend-design-visual-audit-report.md: sampled by code the items most likely left open (A4 start-visit confirm, A5 no-show menu, A13 now line, A14 profile menu, B3 consent collapse, B5 phone, C1 empty-answer cache, C5 live filters, D8 room label, VA5 audit badge tones, VE/VF controls, D7 mobile cards): all already implemented; no further unfixed no-decision issue found beyond the findings above.

Remaining:
- nothing

Findings written: 01..36
