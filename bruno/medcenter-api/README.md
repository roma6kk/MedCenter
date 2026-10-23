# MedCenter API: Bruno collection

Requests for every endpoint of `specs/api-designer-spec.md` §2-§9, one folder per domain, plus the RFC 7807
error catalogue and the E2E chain from §11 (booking, encounter, diagnosis, prescription). Paths, query
parameters and bodies follow the controllers in `apps/*/src`; where code and spec differ the request docs say so.

Open the folder `bruno/medcenter-api` in [Bruno](https://www.usebruno.com/) (Open Collection), choose the
environment **local**.

## Environment `local`

| Variable | Meaning |
| --- | --- |
| `baseUrl` | Traefik edge, `http://localhost:8081` (compose stack, see `tasks/TASK-001/verify-manual-testing-guide.md`) |
| `accessToken` (secret) | Bearer JWT of the role you test; every request inherits it |
| `adminToken`, `doctorToken`, `patientToken` (secret) | tokens per role, used by the E2E chain and the error requests that need a specific role |
| `patientRef`, `otherPatientRef` | `Patient/<id>` of the patient to read (3.2, 3.3, 3.7, 7.4, 7.5) and of someone else (403 example) |
| `encounterId` | encounter for 7.2 (otherwise taken from the patient history, 7.6) |
| `newUserPassword` (secret) | password for the accounts created by 2.2.1 and 2.2.6; choose your own |
| `refreshToken`, `authCode` (secret) | for 2.1.3 (refresh) / 2.1.4 and for the manual code exchange |
| `oauthClientId`, `oauthRedirectUri` | public PKCE client of the web app (`medcenter-web`) |

Secrets have no value in the repository. Fill them in Bruno (Environments, the lock icon) or pass them on the
command line. Nothing in the collection contains a password or a token.

## Getting a token (OAuth2 Authorization Code + PKCE)

auth-service has no password grant: a token needs the browser flow `GET /oauth/authorize` -> login form
`POST /oauth/login` -> `code` -> `POST /oauth/token` with the PKCE `code_verifier`. Two ways:

1. **Helper script (recommended).** `get-token.mjs` replays the flow against the local stack (Node 18+, no
   dependencies) and prints only the access token. Credentials come from the environment:

   ```bash
   export BRUNO_EMAIL=<account e-mail> BRUNO_PASSWORD=<its password>
   node bruno/medcenter-api/get-token.mjs        # prints the JWT (TTL 15 min)
   node bruno/medcenter-api/get-token.mjs --json # whole token response, with refresh_token
   ```

   Demo accounts and their passwords are in the git-ignored `tools/demo-seed/output/demo-manifest.json`
   (never commit or paste them). Paste the JWT into the secret variable `accessToken` (or `doctorToken` ...).
   The login form allows 10 attempts per minute per address.

2. **By hand in Bruno.** Folder `01-auth`: run `2.1.2 Authorize (PKCE)`; its pre-request script creates
   `pkceVerifier` / `pkceChallenge` / `oauthState` and the post-response script stores the full browser URL
   in the variable `authorizeUrl`. Open that URL in a browser, sign in, copy `code` from the redirect to
   `oauthRedirectUri`, put it into `authCode` and run `2.1.3 Token (authorization_code)`: its script stores
   `accessToken` and `refreshToken`. The redirect target is the web app, which also consumes the code, so
   this only works when the web app does not handle the callback (stop the `web` container, or read the code
   from the `Location` header of the redirect in the browser dev tools before the page loads).

Roles and scopes (spec §0): PATIENT holds `patient/*.read|write`, DOCTOR and ADMIN `user/*.read|write`.
Each request lists in its docs which role it needs; a wrong role answers 403 (`FORBIDDEN_ROLE` /
`FORBIDDEN_SCOPE`), another patient's data 403 `COMPARTMENT_VIOLATION`.

## Folders

| Folder | Spec | Notes |
| --- | --- | --- |
| `01-auth` | 2.1 | discovery, JWKS, authorize/token/revoke |
| `02-users` | 2.2 | admin CRUD, registration, `GET /me` |
| `03-terminology` | 2.3 | value sets, expand, validate, import |
| `04-patients` | 3 | own card, staff access, consent with scan, phone |
| `05-practitioners` | 4 | doctors (public), rooms |
| `06-catalog` | 5 | services, schedules, slots |
| `07-appointments` | 6 | booking, list, cancel, doctor view, no-show |
| `08-encounters` | 7 | open, complete, history, prescriptions |
| `09-notifications` | 8 | in-app notifications |
| `10-analytics` | 9 | reports and audit log |
| `11-errors` | 1 | Problem Details catalogue and reproducible error requests |
| `12-e2e-booking-flow` | 6.1 -> 7.1 -> 7.3 | the §11 chain, three roles |

Requests store the ids they read (`doctorId`, `slotId`, `appointmentId`, ...) in runtime variables, so run a
folder top to bottom. A request whose input is missing is skipped, not failed. Every request has assertions
(status, key fields) and a docs tab with the spec number, role and error codes.

## Running from the command line (Bruno CLI)

`@usebruno/cli` is **not** a dependency of this repository; run it with `npx`, pinned:

```bash
cd bruno/medcenter-api
BRU='npx --yes @usebruno/cli@4.2.1 run --env local'

# read-only requests of one role (tags: ro-public, ro-patient, ro-doctor, ro-admin)
$BRU --tags=ro-admin   --env-var accessToken="$ADMIN_TOKEN"  --env-var patientRef=Patient/<id> --env-var encounterId=<id>
$BRU --tags=ro-doctor  --env-var accessToken="$DOCTOR_TOKEN" --env-var patientRef=Patient/<id> --env-var encounterId=<id>
$BRU --tags=ro-patient --env-var accessToken="$PATIENT_TOKEN" --env-var patientToken="$PATIENT_TOKEN" --env-var otherPatientRef=Patient/<other id>

# E2E chain (consumes one free slot of the demo doctor and completes the appointment)
$BRU --tags=e2e --env-var doctorToken="$DOCTOR_TOKEN" --env-var patientToken="$PATIENT_TOKEN"

# admin CRUD with clean-up (rooms, services, schedules, users)
$BRU --tags=ro-admin,crud-rooms,crud-services,crud-schedules,crud-users \
     --env-var accessToken="$ADMIN_TOKEN" --env-var newUserPassword="$CHOOSE_ONE"
```

Tags: `ro-*` read-only per role; `write` changes data; `crud-*` create/update/delete with clean-up; `e2e`
the chain; `errors` error examples; `destructive` never run by the tags above (3.6 and 3.9 revoke the consent,
6.6 marks a no-show); `oauth-manual` the manual PKCE requests; `flow-patient` and `flow-scan` safe writes
(book and cancel, notifications, phone, scan upload and download). Tags select requests that carry any of the
listed tags. Use a local stack only: the collection writes data.
