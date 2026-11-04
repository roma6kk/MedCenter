Status: done

Examined (all 27 items of tasks/TASK-005/verify-open-questions.md sections V2+T2, V2b+V3, T1, T4, T3 triaged; every item has its own finding file):
- V2+T2: V2T2-01 (B undo toast / no rollback API), V2T2-02 (B admin users: MRN/room), V2T2-03 (B row primary action in menu), V2T2-04 (C RESOLVED nowrap), V2T2-05 (A 21 dead i18n keys).
- V2b+V3: V2bV3-01 (B EN date format), V2bV3-02 (A unreadable date has no text error, WCAG 3.3.1), V2bV3-03 (B native time input), V2bV3-04 (A audit filters: error text lifts a field, hint already moved), V2bV3-05 (A jest testTimeout).
- T1: T1-01 (C 7.1 idempotent, label only), T1-02 (B allergies/status/MRN not in TZ), T1-03 (A LastVitals shows 'no vitals' on 403/error), T1-04 (A visit-card orders only from page 1 of prescriptions).
- T4: T4-01 (B complaints/anamnesis), T4-02 (B server draft), T4-03 (C by design leave warning), T4-04 (C label already 'Из истории пациента'), T4-05 (A duplicate of infra-tools-01), T4-06 (B code in observation list), T4-07 (B default unit).
- T3: T3-01 (B roomName), T3-02 (C .ics locale by design), T3-03 (B N requests grouping), T3-04 (B cancel deadline), T3-05 (B second demo doctors), T3-06 (A empty Redis entries cached: services 300 s, terminology 3600 s; dead DOCTORS cache consts).

Remaining: nothing.

Findings written: 27 of 27 (A: 8, B: 14, C: 5). All files validated with python json.load and the required field set.
