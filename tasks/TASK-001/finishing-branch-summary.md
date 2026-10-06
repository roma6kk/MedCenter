# Finishing Branch Summary — TASK-001 backend

- **Skill:** `finishing-branch` · **Date:** 2026-10-06
- **Branch:** `feature/task-001-clinic-platform` · **Worktree:** `.worktrees/task-001-clinic-platform`
- **Base branch:** `main` @ `4f52658` (merge-base `4f52658` — the branch is a clean descendant, no commits on `main` are missing from it)
- **Decision:** **Option 3 — keep the branch as-is.** Worktree preserved; nothing merged, pushed or deleted.

## Prerequisite: verification

`tasks/TASK-001/verify-backend-report.md` was run first and **PASSES** at Standard tier: `nx run-many
--target=test --all` (27 suites / 209 tests), `nx e2e auth-service` (2 suites / 32 tests), `lint --all`,
`build --all` and `npm run typecheck` (the project equivalent of the DoD's `npx tsc --noEmit`, which has no root
`tsconfig.json` to read) all exit 0, with an OWASP review and a GOLDEN-PRINCIPLES self-review recorded. The only failing item in the prior run — check 1, the uncommitted
change set — was closed by the commits below.

## Commits landed (4 new, 7 total on the branch)

| Commit | Scope | Contents |
| --- | --- | --- |
| `feat(common): reject revoked tokens at the guard layer and share the validation pipe` | `libs/common` | `token-revocation.ts` (`TokenRevocationChecker` + `TOKEN_REVOCATION`), `JwtAuthGuard` `jti`/`sid` check → 401 `TOKEN_REVOKED` (fail-open + error log), `request-context.ts` `sid`, `createValidationPipe()`, index exports, guard spec |
| `feat(auth): add the SMART OAuth2 surface with PKCE, rotation and revocation` | `apps/auth-service`, `libs/config`, deps | All five OAuth routes, PKCE/RS256/rotation/revocation with the `sid` link, RFC 7009 ownership, 200 on both POSTs, discovery `token_endpoint_auth_methods_supported` + `grant_types_supported`, narrowed `authorize` catch, validation-safe `TokenRequestDto`, TypeORM entity/migration scaffolding, signing-key env, e2e suites |
| `test: cover the shared metadata decorators, request-id middleware and contracts` | `libs/common`, `libs/contracts` | 5 suites added in the test-generator pass |
| `docs: record the OAuth contract decisions, specs and verification reports` | `specs/`, `tasks/`, `CHANGELOG.md` | `api-designer-spec.md` (`sid`, `TOKEN_REVOKED` at the guard layer, discovery fields), `docs-generator-implementation.md`, `MANIFEST.md`, `CHANGELOG.md`, the four `tasks/TASK-001/` reports |

Commit order is dependency-first: `libs/common` before `apps/auth-service`, so no intermediate commit is broken.

## Why integration was deferred

`main` is checked out in the primary working copy (`/mnt/BE48B9DF48B9971D/projs/MedCenter`) and is **dirty with
the frontend work**, which collides with this branch on exactly:

- `CHANGELOG.md` — modified in both → `git merge` aborts with *"Your local changes would be overwritten"*.
- `specs/MANIFEST.md` — modified in both → same abort.
- `specs/docs-generator-implementation.md` — untracked in both → the merge would refuse or clobber the copy in
  `main`.

Those changes belong to the frontend thread, so they were left untouched: nothing was stashed, committed or
discarded. There is also **no git remote configured** (`git remote -v` is empty; `gh` 2.46.0 is installed but
has no `origin`), so a push/PR was not possible.

## How to complete the integration later

```bash
# 1. resolve main's uncommitted state first (commit or move the frontend work)
# 2. then, from the primary working copy:
git merge feature/task-001-clinic-platform      # clean descendant; no conflicts expected
npx nx run-many --target=test --all && npx nx e2e auth-service   # verify on the merged result
# 3. the frontend branch (feature/task-001-frontend @ 1c135b2) still needs its own finishing-branch pass
```

## Context Summary

The TASK-001 backend implementation was verified green and committed as four logical commits on
`feature/task-001-clinic-platform`, and the `finishing-branch` decision was to keep the branch as-is rather than
merge, push or discard. Integration was deferred deliberately: `main` carries uncommitted frontend work that
collides with this branch on three documentation paths, and no git remote exists to push to.

**Next Steps (STOP — choose one):**

**Next by flow:** `/docs-generator` — refresh the living specs and `CHANGELOG.md` for the committed change set.
**Alternatives:**
- `/verify` — re-run the gate on the committed tree.
- `/coder` — close the carried-forward findings (M8 cache headers, M3 client-config validation, the remaining M2/M5/M9 and R4–R9).
- Complete the integration once `main`'s uncommitted state is resolved (see above).
