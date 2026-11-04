# Package F-shared (frontend lane) — progress, attempt 1
NOTE: the Bash tool shell is zsh-like and does not word-split a variable holding several paths — pass paths literally to git add/commit.
- task005-triage-b-32: done 260ff79 — useLeadSkeleton registry: only the first mounted ContentSkeleton/TableSkeleton is the role=status region and carries «Загружаем…»; modal (aria-modal) is its own scope; LoadingNote got `quiet`
- task005-triage-b-36: done ec4cffb — glass alpha 0.72 -> 0.8 in both themes (worst muted-foreground over fill was 4.18 light / 3.84 dark); globals-contrast.spec has glass cases (gamma-space compositing over 9 fills)
- task005-triage-a-V2bV3-02: done f90d662 — DatePicker shows «Не похоже на дату. Формат: дд.мм.гггг» (icon+text, role=alert, merged into aria-describedby) after blur/Enter and until fixed (not while typing: every partial date is unreadable); new keys ui.datePicker.unreadable ru+en; input+button now in an inner relative box
- task005-triage-b-31: done 733cb89 — applyTheme sets data-theme-switching on <html> (forced layout, lifted by setTimeout 0, restarts on a second switch); globals.css :root[data-theme-switching] * {transition:none !important}; head script untouched
- task005-triage-a-V2T2-05: done ca0f76b — removed the 21 dead keys from ru.json and en.json (1494 keys each, parity kept); new src/lib/i18n/catalog-usage.spec.ts fails on a key whose last segment is nowhere in the code, with an allow-list of the 12 composed keys
- task005-triage-a-V2bV3-05: done 1a3ad15 — frontend/jest.config.ts testTimeout 15_000 (resolved config checked with --showConfig); the ten 30 s overrides stay
- task005-triage-b-05: done 434f7a9 — specs/frontend-design-spec.md: patient route group + landing /home, screen table (/home, /medcard tabs, legacy /profile /history /prescriptions redirects), FR-006/007 matrix, role redirect, profile block renamed (MANIFEST.md has no route mentions, unchanged)
- full jest run: passed — 262 suites, 2905 tests (npx jest --maxWorkers=2); npx tsc --noEmit and npx next lint clean on the final tree
Status: done
