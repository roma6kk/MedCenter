
# Медицинский центр — Implementation Plan

**Task:** TASK-001

> **For Claude:** Use `using-git-worktrees` to create isolated workspace, then implement with `coder` skill.

**Goal:** Build the full web application for a medical clinic — 8 stateless NestJS BFF services behind a
Traefik reverse-proxy, HAPI FHIR JPA (R4) as the clinical engine, RabbitMQ events, and a Next.js
(App Router) client — satisfying 21 FR, 9 BR, 11 NFR.

**Architecture:** Hybrid. HAPI FHIR JPA (R4, Java) is an off-the-shelf container holding every clinical
R4 resource. All authored code is TypeScript: 8 stateless BFF services (`apps/*`) sharing Nx libraries
(`libs/contracts`, `libs/fhir`, `libs/fhir-mappers`, `libs/terminology`, `libs/common`, `libs/config`).
Traffic enters through Traefik at `/api/v1/**`; **Traefik does not validate tokens** — every BFF mounts
the shared guard stack (`JwtAuthGuard` → `ScopeGuard` → `RoleGuard` → `RateLimitGuard`) via `APP_GUARD`.
Synchronous FHIR REST via `fhir-kit-client` for clinical data; asynchronous domain events over RabbitMQ
for notifications.

**Tech Stack:** TypeScript (strict) · NestJS 11 · Nx monorepo · Next.js 15 (App Router) · TanStack Query +
Zustand · Tailwind + shadcn/ui · react-hook-form + zod · next-intl (ru-BY) · HAPI FHIR JPA R4 · PostgreSQL
(TypeORM, schema `auth`) · Redis · RabbitMQ · Jest · Testcontainers · Playwright · Docker Compose · Traefik

---

## Sources of truth (read before implementing — do not duplicate)

| Document                                                | What it fixes                                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `tasks/TASK-001/requirements-analyst-requirements.md` | 21 FR, 11 NFR, 9 BR, KDR-1…10, A-1…A-9                                               |
| `tasks/TASK-001/brainstorming-design.md`              | Design decisions D1–D9, data model, E2E flows                                         |
| `specs/architect-architecture.md`                     | Layers, module placement, ADR-001…017 (**all Accepted**), data-ownership matrix |
| `specs/api-designer-spec.md`                          | 59 endpoints, DTOs, 16`errorCode`s, scopes, pagination, Swagger, Bruno               |
| `specs/frontend-design-spec.md`                       | Design tokens, routes, components, state,`errorCode`→UX map, 6 E2E scenarios        |

**Hard constraints (violating any of these fails review):**

1. **Belarusian clinic → HL7 FHIR International R4 only.** Never reference Belgian IGs, NIHDI/INAMI,
   MyCareNet or the eHealth Platform. Terminology canonical URLs are `https://fhir.by/...`; UCUM is
   `http://unitsofmeasure.org`.
2. **No NestJS gateway** (ADR-009). Traefik routes; guards live in each service.
3. **Single-owner rule:** each FHIR resource is written by exactly one service (architect §5).
4. **Patient compartment (ADR-013):** `patientRef` comes from JWT context; a `patient` query param is
   ignored for `patient/*` scopes.
5. `GOLDEN-PRINCIPLES.md`: kebab-case files, no `any`, no `!` assertions, explicit return types,
   ≤300 lines/file, ≤30 lines/function.
6. Secrets only via env; `.env` never committed. Input validated at every boundary with `class-validator`.

---

## Milestones

| #            | Milestone           | Tasks  | Gate                                                                                  |
| ------------ | ------------------- | ------ | ------------------------------------------------------------------------------------- |
| **M0** | Foundation          | 1–4   | `nx run-many --target=test --all` green; HAPI reachable; `CapabilityStatement` R4 |
| **M1** | Auth                | 5–7   | PKCE login works end-to-end; compartment enforced                                     |
| **M2** | Catalog             | 8–11  | Doctors/services/slots queryable; slot generation idempotent                          |
| **M3** | Booking             | 12–13 | Concurrent booking → exactly one 201, one 409`SLOT_CONFLICT`                       |
| **M4** | Clinical            | 14     | Complete-encounter writes 6 resource types atomically; replay → 409                  |
| **M5** | Analytics           | 15     | Dashboard aggregates + audit log populated                                            |
| **M6** | Frontend            | 16–19 | 5 route groups render;`errorCode`→UX map complete (16/16)                          |
| **M7** | Verification & docs | 20–21 | 8 Playwright scenarios green; ПЗ + draw.io artifacts produced                       |

**Dependency order:** M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7. Tasks inside a milestone may run in
parallel only when they touch disjoint files.

---

## Global commands

```bash
# Workspace-wide (used at every task gate)
npx nx run-many --target=test --all
npx nx run-many --target=lint --all
npx nx run-many --target=build --all
npx tsc --noEmit -p tsconfig.base.json   # strict typecheck

# Single project
npx nx test auth-service
npx nx e2e appointment-service
npx nx serve appointment-service

# Stack lifecycle (after Task 4)
docker compose up -d --wait          # postgres, redis, rabbitmq, hapi, traefik
docker compose logs -f hapi
docker compose down -v
```

**Commit convention** (every task ends with one commit): `feat(<scope>): <imperative summary>`,
`test(<scope>): …`, `chore(<scope>): …`. Never `--no-verify` (AGENTS.md).

---

# M0 — Foundation

## Task 1: Nx monorepo bootstrap

**Files:**

- Create: `package.json`, `nx.json`, `tsconfig.base.json`, `.eslintrc.json`, `.prettierrc`, `.gitignore`
- Create: `apps/auth-service/{project.json,tsconfig.json,tsconfig.app.json,tsconfig.spec.json,jest.config.ts}`
- Create: `libs/common/{project.json,tsconfig.json,tsconfig.lib.json,jest.config.ts}`
- Create: `apps/auth-service/src/main.ts`, `apps/auth-service/src/app/app.module.ts`

**Step 1: Write the failing smoke test**

`apps/auth-service/src/app/app.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();
    controller = module.get<AppController>(AppController);
  });

  it('should return service metadata when root is requested', () => {
    expect(controller.getInfo()).toEqual({ service: 'auth-service', status: 'ok' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test auth-service`
Expected: FAIL — `Cannot find module './app.controller'`.

**Step 3: Scaffold the workspace**

`package.json` (root):

```json
{
  "name": "medcenter",
  "private": true,
  "packageManager": "npm@11.19.0",
  "scripts": {
    "build": "nx run-many --target=build --all",
    "test": "nx run-many --target=test --all",
    "lint": "nx run-many --target=lint --all",
    "typecheck": "tsc --noEmit -p tsconfig.base.json",
    "stack:up": "docker compose up -d --wait",
    "stack:down": "docker compose down -v"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "class-validator": "^0.14.1",
    "class-transformer": "^0.5.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nx/jest": "^21.0.0",
    "@nx/js": "^21.0.0",
    "@nx/nest": "^21.0.0",
    "@nx/workspace": "^21.0.0",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.0",
    "jest": "^29.7.0",
    "nx": "^21.0.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.7.0"
  }
}
```

`tsconfig.base.json` — **strict mode is mandatory** (GOLDEN-PRINCIPLES):

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@medcenter/contracts": ["libs/contracts/src/index.ts"],
      "@medcenter/common": ["libs/common/src/index.ts"],
      "@medcenter/config": ["libs/config/src/index.ts"],
      "@medcenter/fhir": ["libs/fhir/src/index.ts"],
      "@medcenter/fhir-mappers": ["libs/fhir-mappers/src/index.ts"],
      "@medcenter/terminology": ["libs/terminology/src/index.ts"]
    },
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "exclude": ["node_modules", "tmp", "dist"]
}
```

`.gitignore` (note: `.env` is never committed — AGENTS.md):

```
node_modules/
dist/
tmp/
.nx/
coverage/
.env
.env.*
!.env.example
playwright-report/
test-results/
```

`apps/auth-service/src/app/app.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';

interface ServiceInfo {
  readonly service: string;
  readonly status: 'ok';
}

@Controller()
export class AppController {
  @Get()
  getInfo(): ServiceInfo {
    return { service: 'auth-service', status: 'ok' };
  }
}
```

`apps/auth-service/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env['PORT'] ?? 3001);
}

void bootstrap();
## Task 2: `libs/contracts` — shared DTOs, error codes, event contracts

**Files:**
- Create: `libs/contracts/src/lib/error-code.ts`, `problem-details.ts`, `pagination.dto.ts`
- Create: `libs/contracts/src/lib/role.enum.ts`, `smart-scopes.ts`
- Create: `libs/contracts/src/lib/events/{appointment-booked,appointment-cancelled,encounter-completed,patient-registered}.event.ts`
- Create: `libs/contracts/src/index.ts`
- Test: `libs/contracts/src/lib/{pagination.dto,error-code}.spec.ts`

This library is the single source of truth shared by all 8 services **and** the Next.js client, so it
must stay free of server-only imports: plain types + runtime constants, no `@nestjs/*`.

**Step 1: Write the failing test**

`libs/contracts/src/lib/pagination.dto.spec.ts`:

```typescript
import { buildPaginatedResponse } from './pagination.dto';

describe('buildPaginatedResponse', () => {
  it('should wrap items and meta into the standard envelope', () => {
    const result = buildPaginatedResponse<{ id: string }>([{ id: 'a' }], {
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });

    expect(result).toEqual({
      items: [{ id: 'a' }],
      meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test contracts`
Expected: FAIL — `Cannot find module './pagination.dto'`.

**Step 3: Write the implementation**

`libs/contracts/src/lib/error-code.ts` — exactly the 16 codes from API §1, no more, no fewer:

```typescript
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'TOKEN_REVOKED',
  'FORBIDDEN_SCOPE',
  'FORBIDDEN_ROLE',
  'COMPARTMENT_VIOLATION',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'SLOT_CONFLICT',
  'APPOINTMENT_NOT_CANCELLABLE',
  'ENCOUNTER_STATE_INVALID',
  'SCHEDULE_OVERLAP',
  'INVALID_ICD10_CODE',
  'TERMINOLOGY_NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_CODE_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  TOKEN_REVOKED: 401,
  FORBIDDEN_SCOPE: 403,
  FORBIDDEN_ROLE: 403,
  COMPARTMENT_VIOLATION: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  SLOT_CONFLICT: 409,
  APPOINTMENT_NOT_CANCELLABLE: 409,
  ENCOUNTER_STATE_INVALID: 409,
  SCHEDULE_OVERLAP: 409,
  INVALID_ICD10_CODE: 422,
  TERMINOLOGY_NOT_FOUND: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};
```

`libs/contracts/src/lib/problem-details.ts` — RFC 7807 plus the two extra fields the API mandates:

```typescript
import type { ErrorCode } from './error-code';

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly requestId: string;
  readonly errorCode: ErrorCode;
}

export interface FieldErrorDetail {
  readonly field: string;
  readonly message: string;
}
```

`libs/contracts/src/lib/pagination.dto.ts`:

```typescript
export interface PageMetaDto {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResponseDto<TItem> {
  items: TItem[];
  meta: PageMetaDto;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function buildPaginatedResponse<TItem>(
  items: TItem[],
  meta: PageMetaDto,
): PaginatedResponseDto<TItem> {
  return { items, meta };
}
```

`libs/contracts/src/lib/role.enum.ts`:

```typescript
export enum Role {
  PATIENT = 'PATIENT',
  DOCTOR = 'DOCTOR',
  ADMIN = 'ADMIN',
}
```

`libs/contracts/src/lib/smart-scopes.ts`:

```typescript
export const SMART_SCOPES = {
  PATIENT_READ: 'patient/*.read',
  PATIENT_WRITE: 'patient/*.write',
  USER_READ: 'user/*.read',
  USER_WRITE: 'user/*.write',
  LAUNCH: 'launch',
} as const;

export type SmartScope = (typeof SMART_SCOPES)[keyof typeof SMART_SCOPES];
```

`libs/contracts/src/lib/events/appointment-booked.event.ts` (all four events follow architect §4.4; each
carries `v: 1`, `eventId`, `occurredAt`):

## Task 3: `libs/config` and `libs/common` — env schema, guards, RFC 7807 filter

**Files:**

- Create: `libs/config/src/lib/env.schema.ts`, `libs/config/src/index.ts`
- Create: `libs/common/src/lib/filters/problem-details.filter.ts`
- Create: `libs/common/src/lib/decorators/{public,requires-scopes,requires-roles}.decorator.ts`
- Create: `libs/common/src/lib/guards/{jwt-auth,scope,role,rate-limit}.guard.ts`
- Create: `libs/common/src/lib/request-context.ts` (ADR-013 compartment)
- Test: `libs/common/src/lib/{request-context,problem-details.filter}.spec.ts`

**Step 1: Write the failing tests**

`libs/common/src/lib/request-context.spec.ts` — security-critical (compartment):

```typescript
import { hasScope, resolvePatientRef } from './request-context';

describe('resolvePatientRef', () => {
  it('should return the patientRef from JWT context for a patient-scope token', () => {
    const claims = { sub: 'u1', scope: 'patient/*.read', role: 'PATIENT', patient: 'Patient/9f2c', jti: 'j1' };

    expect(resolvePatientRef(claims)).toBe('Patient/9f2c');
  });

  it('should return null when a patient-scope token carries no patient claim', () => {
    const claims = { sub: 'u1', scope: 'patient/*.read', role: 'PATIENT', jti: 'j1' };

    expect(resolvePatientRef(claims)).toBeNull();
  });
});

describe('hasScope', () => {
  it('should return true when the granted scope list contains the required scope', () => {
    const claims = { sub: 'u1', scope: 'patient/*.read launch', role: 'PATIENT', jti: 'j1' };

    expect(hasScope(claims, 'launch')).toBe(true);
  });

  it('should return false when the required scope is absent', () => {
    const claims = { sub: 'u1', scope: 'patient/*.read', role: 'PATIENT', jti: 'j1' };

    expect(hasScope(claims, 'user/*.write')).toBe(false);
  });
});
```

`libs/common/src/lib/filters/problem-details.filter.spec.ts`:

```typescript
import { ProblemDetailsFilter } from './problem-details.filter';

describe('ProblemDetailsFilter', () => {
  it('should map a validation error to 400 VALIDATION_ERROR', () => {
    const problem = ProblemDetailsFilter.fromValidationError('/api/v1/appointments', 'req-1', [
**Step 3: Write the implementation**

`libs/config/src/lib/env.schema.ts` — zod-validated env; secrets never get defaults:

```typescript
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  FHIR_BASE_URL: z.string().url(),
  FHIR_CLIENT_ID: z.string().min(1),
  FHIR_CLIENT_SECRET: z.string().min(1),
  JWT_JWKS_URI: z.string().url(),
  JWT_ISSUER: z.string().min(1),
  REDIS_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  TERMINOLOGY_UPSTREAM_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;
```

`libs/common/src/lib/request-context.ts` — ADR-013 lives here: a `patient/*`-scoped request never trusts
a `patient` query parameter.

```typescript
export interface JwtClaims {
  readonly sub: string;
  readonly scope: string;
  readonly role: string;
  readonly patient?: string;
  readonly fhirUser?: string;
  readonly jti: string;
}

export function hasScope(claims: JwtClaims, required: string): boolean {
  return claims.scope.split(' ').includes(required);
}

export function resolvePatientRef(claims: JwtClaims): string | null {
  return claims.patient ?? null;
}
```

> Implementation note: the *service* enforces "ignore the `patient` query param" — controllers on
> `patient/*`-scoped routes must never read `query.patient`. Add this to the review checklist, because it
> cannot be expressed as a TypeScript error.

`libs/common/src/lib/filters/problem-details.filter.ts`:

```typescript
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import {
  ERROR_CODE_HTTP_STATUS,
  type ErrorCode,
  type FieldErrorDetail,
  type ProblemDetails,
} from '@medcenter/contracts';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  static fromValidationError(instance: string, requestId: string, details: FieldErrorDetail[]): ProblemDetails {
    return {
      type: 'https://api.medcenter.by/errors/validation-error',
      title: 'Validation failed',
      status: ERROR_CODE_HTTP_STATUS.VALIDATION_ERROR,
      detail: details.map((d) => `${d.field}: ${d.message}`).join('; '),
      instance,
      requestId,
      errorCode: 'VALIDATION_ERROR',
    };
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ originalUrl: string; requestId?: string }>();
    const response = ctx.getResponse<Response>();
    const requestId = request.requestId ?? 'unknown';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const errorCode = this.toErrorCode(status);
      response.status(status).type('application/problem+json').send({
        type: `https://api.medcenter.by/errors/${errorCode.toLowerCase().replace(/_/g, '-')}`,
        title: exception.name,
        status,
        detail: exception.message,
        instance: request.originalUrl,
        requestId,
        errorCode,
      } satisfies ProblemDetails);
      return;
    }

    this.logger.error({ err: exception, requestId }, 'Unhandled exception');
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).type('application/problem+json').send({
      type: 'https://api.medcenter.by/errors/internal',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Внутренняя ошибка сервера',
      instance: request.originalUrl,
      requestId,
      errorCode: 'INTERNAL',
    } satisfies ProblemDetails);
  }

  private toErrorCode(status: number): ErrorCode {
    const found = Object.entries(ERROR_CODE_HTTP_STATUS).find(([, value]) => value === status);
    return (found?.[0] as ErrorCode | undefined) ?? 'INTERNAL';
  }
}
```

> Security note (OWASP A05): the 500 branch never echoes `exception.message`. Internal detail goes to
> the pino log keyed by `requestId`; the client receives only the correlation id.

Decorators and guards: `Public` exempts a route from `JwtAuthGuard`; `RequiresScopes('patient/*.write')`
and `RequiresRoles(Role.ADMIN)` are read by `ScopeGuard`/`RoleGuard` through `Reflector`; `RateLimitGuard`
increments a Redis counter keyed `userId:route:minute` and throws `429 RATE_LIMITED` with `Retry-After`
(default `120 req/min`; `20 req/min` on `POST /oauth/token`).

**Step 4: Run tests to verify they pass**

Run: `npx nx test common`
Expected: PASS.

**Step 5: Wire the guard stack globally and prove it cannot be forgotten**

In **every** `apps/*/src/app/app.module.ts`:

```typescript
import { APP_GUARD } from '@nestjs/core';

providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: ScopeGuard },
  { provide: APP_GUARD, useClass: RoleGuard },
  { provide: APP_GUARD, useClass: RateLimitGuard },
]
```

`APP_GUARD` is deliberate: it is the global default, so a new service cannot physically ship without the
security stack — the main risk ADR-009 introduces.

Then add `apps/auth-service/test/jwt-perimeter.e2e-spec.ts`, which boots the app and asserts an
unauthenticated request returns 401. This is the perimeter-distribution regression test demanded by the
architecture spec's "Разрешение открытых гейтов" section; replicate it for every service as you add it.

**Step 6: Run the gate**

Run: `npx nx run-many --target=test --all && npx nx run-many --target=lint --all`
Expected: green.

**Step 7: Commit**

```bash
git add libs/config libs/common apps/auth-service
git commit -m "feat(common): add RFC7807 filter, shared guard stack and compartment resolution"
```

---

      { field: 'slotId', message: 'must be a UUID' },
    ]);

    expect(problem.status).toBe(400);
    expect(problem.errorCode).toBe('VALIDATION_ERROR');
  });
});

```
## Task 4: `infra/` — Docker Compose stack, HAPI FHIR, Traefik, terminology seed

**Files:**
- Create: `docker-compose.yml`, `.env.example`
- Create: `infra/traefik/dynamic.yml`
- Create: `tools/terminology-seed/seed-terminology.ts`, `tools/terminology-seed/snapshot/*.json`
- Test: `tools/terminology-seed/seed-terminology.spec.ts`

**Step 1: Write the failing test**

```typescript
// tools/terminology-seed/seed-terminology.spec.ts
import { buildCodeSystems } from './seed-terminology';

describe('buildCodeSystems', () => {
  it('should produce R4 CodeSystems preserving the fhir.by canonical URL', () => {
    expect(buildCodeSystems()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://fhir.by/CodeSystem/nsi-services' }),
      ]),
    );
  });

  it('should include the ICD-10 canonical required by the API contract', () => {
    expect(buildCodeSystems().some((s) => s.url.includes('InternClassificDiseases10'))).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tools/terminology-seed/seed-terminology.spec.ts`
Expected: FAIL — module not found.

**Step 3: Write the seed implementation**

ADR-002/016: seed R4 `CodeSystem`/`ValueSet` into HAPI **preserving the `https://fhir.by/...` canonical**;
ADR-017: bind by `system`/`code`, never by profile version. The snapshot ships in-repo so the stack boots
without upstream access — this is what resolves risk R-1.

```typescript
interface SeedCodeSystem {
  readonly url: string;
  readonly version: string;
  readonly name: string;
  readonly status: 'active';
  readonly content: 'complete' | 'example';
  readonly caseSensitive: boolean;
  readonly concept: ReadonlyArray<{ readonly code: string; readonly display: string }>;
}

export function buildCodeSystems(): SeedCodeSystem[] {
  return [
    {
      url: 'https://fhir.by/CodeSystem/nsi-services',
      version: '1.4.463',
      name: 'НСИ ЦИСЗ — услуги',
      status: 'active',
      content: 'complete',
      caseSensitive: false,
      concept: snapshot.services.map((c) => ({ code: c.code, display: c.display })),
    },
    {
      url: 'https://fhir.by/CodeSystem/nsi-observations',
      version: '1.4.463',
      name: 'НСИ ЦИСЗ — исследования',
      status: 'active',
      content: 'complete',
      caseSensitive: true,
      concept: snapshot.observations.map((c) => ({ code: c.code, display: c.display })),
    },
    {
      url: 'http://www.whocc.no/atc',
      version: '2024',
      name: 'АТХ (ATC)',
      status: 'active',
      content: 'example',
      caseSensitive: true,
      concept: snapshot.atc.map((c) => ({ code: c.code, display: c.display })),
    },
  ];
}
```

The script POSTs each resource to `POST /fhir`, then expands the МКБ-10 ValueSet that the API contract
references as `https://fhir.by/ValueSet/InternClassificDiseases10`.

**Step 4: Write the stack and the edge routing**

`docker-compose.yml` — **≥ 6 containers** required by NFR-001; actual is 8 BFF + HAPI + Traefik + PG +
Redis + RabbitMQ:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: medcenter
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: medcenter
    ports: ['5432:5432']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U medcenter']
      interval: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      retries: 10

  rabbitmq:
    image: rabbitmq:3-management-alpine
    healthcheck:
      test: ['CMD', 'rabbitmq-diagnostics', '-q', 'ping']
      interval: 10s
      retries: 10

  hapi:
    image: hapiproject/hapi:latest
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/medcenter
      SPRING_DATASOURCE_USERNAME: medcenter
      SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD}
    depends_on:
      postgres: { condition: service_healthy }
    ports: ['8080:8080']   # dev only — never published publicly in prod

  traefik:
    image: traefik:v3
    command:
      - '--providers.docker=true'
      - '--providers.docker.exposedbydefault=false'
      - '--providers.file.directory=/etc/traefik/dynamic'
      - '--entrypoints.websecure.address=:443'
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./infra/traefik/dynamic.yml:/etc/traefik/dynamic/dynamic.yml:ro
    ports: ['443:443']
```

`infra/traefik/dynamic.yml` routes `/api/v1/appointments/*` → `appointment-service`, `/fhir/*` → `hapi`,
`/.well-known/*` and `/oauth/*` → `auth-service`. **Traefik performs no token validation** (ADR-009); it
only terminates TLS, sets security headers and propagates `request-id`.

`.env.example` lists every key with a placeholder value; `.env` is git-ignored and never committed.

**Step 5: Verify the stack**

Run: `cp .env.example .env && docker compose up -d --wait`
Run: `curl -s localhost:8080/fhir/metadata | jq '.fhirVersion'`
Expected: `"4.0.1"`.

Run: `npx jest tools/terminology-seed`
Expected: PASS — 2 tests.

**Step 6: Seed and re-verify the canonical URL survived**

Run: `npx tsx tools/terminology-seed/seed-terminology.ts && curl -s 'localhost:8080/fhir/ValueSet?url=https://fhir.by/ValueSet/InternClassificDiseases10' | jq '.total'`
Expected: `> 0`.

**Step 7: Commit**

```bash
git add docker-compose.yml .env.example infra/traefik tools/terminology-seed
git commit -m "feat(infra): add compose stack with HAPI FHIR R4, Traefik edge and terminology seed"
```

**M0 gate:** `npx nx run-many --target=test --all` green · `npx tsc --noEmit` clean · HAPI reports
`fhirVersion 4.0.1` · seed imported with canonical URLs preserved.

---

**Step 2: Run tests to verify they fail**

Run: `npx nx test common`
Expected: FAIL — modules not found.

```typescript
export interface DomainEventBase {
  readonly v: 1;
  readonly eventId: string;
  readonly occurredAt: string;
}

export interface AppointmentBookedEvent extends DomainEventBase {
  readonly type: 'appointment.booked.v1';
  readonly appointmentId: string;
  readonly patientRef: string;
  readonly practitionerRoleRef: string;
  readonly slotRef: string;
  readonly start: string;
  readonly serviceId: string;
}
```

Siblings: `AppointmentCancelledEvent { appointmentId, patientRef, reason, actorType }`,
`EncounterCompletedEvent { encounterId, patientRef, practitionerRef, diagnoses }`,
`PatientRegisteredEvent { patientId, email }`, plus
`DOMAIN_EVENT_EXCHANGE = 'medical.events'` and `DLQ_SUFFIX = '.dlq'`.

**Step 4: Run test to verify it passes**

Run: `npx nx test contracts`
Expected: PASS.

**Step 5: Add the drift guard**

`libs/contracts/src/lib/error-code.spec.ts` — the frontend spec promises a 16/16 `errorCode`→UX map, so
the catalog size is a contract, not an implementation detail:

```typescript
import { ERROR_CODES, ERROR_CODE_HTTP_STATUS } from './error-code';

describe('ERROR_CODES', () => {
  it('should contain exactly 16 codes', () => {
    expect(ERROR_CODES).toHaveLength(16);
  });

  it('should map every code to an error status', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_CODE_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });
});
```

Run: `npx nx test contracts` → Expected: PASS — 2 tests.

**Step 6: Commit**

```bash
git add libs/contracts
git commit -m "feat(contracts): add shared error catalog, pagination envelope and domain event types"
```

---

```

**Step 4: Run test to verify it passes**

Run: `npx nx test auth-service`
Expected: PASS — 1 test.

**Step 5: Verify the gate**

Run: `npx nx run-many --target=test --all && npx nx run-many --target=lint --all && npx tsc --noEmit -p tsconfig.base.json`
Expected: all green, zero TypeScript errors.

**Step 6: Commit**

```bash
git add package.json nx.json tsconfig.base.json .eslintrc.json .prettierrc .gitignore apps/auth-service
git commit -m "chore(workspace): bootstrap Nx monorepo with auth-service scaffold"
```

---

# M1 — Auth (SMART on FHIR)

## Task 5: `auth-service` — TypeORM schema `auth` + user entities

**Files:**

- Create: `apps/auth-service/src/modules/users/entities/{user,role,user-role,external-link,oauth-client,oauth-token}.entity.ts`
- Create: `apps/auth-service/src/modules/users/repositories/user.repository.ts`
- Create: `apps/auth-service/src/database/typeorm.config.ts`, `apps/auth-service/src/database/migrations/1700000000000-Init.ts`
- Test: `apps/auth-service/src/modules/users/repositories/user.repository.spec.ts` (Testcontainers + PostgreSQL)

**Step 1: Write the failing test**

```typescript
describe('UserRepository', () => {
  let repository: UserRepository;

  beforeAll(async () => {
    const container = await new PostgreSqlContainer().start();
    // build DataSource with schema 'auth', run migrations, instantiate repository
  }, 60_000);

  afterAll(async () => { await container.stop(); });

  it('should find an active user by email', async () => {
    await repository.save(repository.create({ email: 'ivanov@example.by', passwordHash: 'x', isActive: true }));

    expect((await repository.findByEmail('ivanov@example.by'))?.email).toBe('ivanov@example.by');
  });

  it('should exclude inactive users from the login lookup', async () => {
    await repository.save(repository.create({ email: 'off@example.by', passwordHash: 'x', isActive: false }));

    expect(await repository.findByEmailForLogin('off@example.by')).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test auth-service -- --testPathPattern=user.repository`
Expected: FAIL — repository not implemented.

**Step 3: Write the entities and migration**

`user.entity.ts`:

```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'user', schema: 'auth' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

`external-link.entity.ts` is the FHIR bridge (`User` ⇄ `Patient` | `PractitionerRole`):

```typescript
@Entity({ name: 'external_link', schema: 'auth' })
export class ExternalLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ length: 100, name: 'resource_type' })
  resourceType: 'Patient' | 'PractitionerRole';

  @Column({ length: 64, name: 'resource_id' })
  resourceId: string;
## Task 6: `auth-service` — SMART / OAuth2 endpoints (API 2.1.1–2.1.5)

**Files:**
- Create: `apps/auth-service/src/modules/oauth/oauth.controller.ts`, `oauth.service.ts`
- Create: `apps/auth-service/src/modules/oauth/{jwt.service,jwks.service,pkce.service,token.service}.ts`
- Create: `apps/auth-service/src/modules/oauth/guards/{authorize-page,client}.guard.ts`
- Create: `apps/auth-service/src/modules/oauth/dto/token-request.dto.ts`
- Test: `apps/auth-service/src/modules/oauth/{pkce,jwt}.service.spec.ts`, `apps/auth-service/test/oauth.e2e-spec.ts`

**Step 1: Write the failing tests**

```typescript
// pkce.service.spec.ts
describe('PkceService', () => {
  it('should accept a verifier matching the stored S256 challenge', () => {
    const verifier = 'a'.repeat(64);
    const challenge = base64url(sha256(verifier));

    expect(service.verify(challenge, verifier)).toBe(true);
  });

  it('should reject a verifier that does not match the stored challenge', () => {
    const challenge = base64url(sha256('a'.repeat(64)));

    expect(service.verify(challenge, 'b'.repeat(64))).toBe(false);
  });
});
```

```typescript
// jwt.service.spec.ts
describe('JwtService', () => {
  it('should embed role and patientRef in the access token claims', () => {
    const token = service.signAccessToken({
      sub: 'u1', role: 'PATIENT', patientRef: 'Patient/9f2c', scope: 'patient/*.read',
    });
    const claims = decodeJwt(token);

    expect(claims.role).toBe('PATIENT');
    expect(claims.patient).toBe('Patient/9f2c');
    expect(claims.exp - claims.iat).toBe(900);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test auth-service -- --testPathPattern=pkce|jwt`
Expected: FAIL.

**Step 3: Implement PKCE (S256 only) and RS256 JWT**

`pkce.service.ts`:

```typescript
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

@Injectable()
export class PkceService {
  generate(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = randomBytes(32).toString('base64url');

    return { codeVerifier, codeChallenge: this.challenge(codeVerifier) };
  }

  challenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
  }

  verify(storedChallenge: string, codeVerifier: string): boolean {
    const expected = Buffer.from(this.challenge(codeVerifier));
    const actual = Buffer.from(storedChallenge);

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
```

`timingSafeEqual` is deliberate: a plain `===` leaks the verifier through timing (CWE-208).

`jwt.service.ts` signs **RS256** with a 15-minute TTL and publishes the public key at
`GET /.well-known/jwks.json` (API 2.1.5) so every BFF service verifies independently through
`libs/common` (ADR-009). Refresh tokens live 14 days and **rotate on every use**; the consumed `jti`
goes into the Redis denylist, which is what makes `TOKEN_REVOKED` detectable.

`oauth.controller.ts` exposes exactly five routes:

| Route                                    | Auth                | Notes                                                                                       |
| ---------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `GET /.well-known/smart-configuration` | public              | `fhir_base` → HAPI internal URL                                                          |
| `GET /oauth/authorize`                 | public + login page | requires`code_challenge_method=S256`; 302 on success, `?error=access_denied` on failure |
| `POST /oauth/token`                    | public + rate limit | `x-www-form-urlencoded`; `20 req/min` by `clientId`+IP                                |
| `POST /oauth/token/revoke`             | Bearer              | refresh`jti` → Redis denylist                                                            |
| `GET /.well-known/jwks.json`           | public              | RSA public key                                                                              |

> Assumption UI-1 (from the frontend spec, deliberate): the credential form is rendered **inside**
> `GET /oauth/authorize`. No `POST /api/v1/auth/login` endpoint is invented — if one is ever needed,
> that is an API-spec change outside TASK-001.

**Step 4: Run tests to verify they pass**

## Task 7: `auth-service` — users, registration, `/me`, admin CRUD, audit

**Files:**

- Create: `apps/auth-service/src/modules/users/{users.controller,users.service}.ts`
- Create: `apps/auth-service/src/modules/users/dto/{register-patient,update-user,list-users-query}.dto.ts`
- Create: `apps/auth-service/src/modules/users/dto/{user-response,me-response}.dto.ts`
- Create: `apps/auth-service/src/modules/audit/audit.service.ts` (writes `AuditEvent` to HAPI — FR-021)
- Test: `apps/auth-service/src/modules/users/users.service.spec.ts`, `apps/auth-service/test/users.e2e-spec.ts`

**Step 1: Write the failing tests**

```typescript
describe('UsersService', () => {
  it('should create a FHIR Patient and link it when a patient self-registers', async () => {
    const user = await service.registerPatient({
      email: 'ivanov@example.by', firstName: 'Иван', lastName: 'Иванов',
      password: 'Str0ng!Pass', birthDate: '1990-05-12',
    });

    expect(fhirClient.create).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'Patient' }));
    expect(user.patientRef).toMatch(/^Patient\//);
  });

  it('should reject a duplicate email with EMAIL_TAKEN', async () => {
    await service.registerPatient(registrationDto);

    await expect(service.registerPatient(registrationDto)).rejects.toThrow('EMAIL_TAKEN');
  });

  it('should soft-deactivate rather than delete a user', async () => {
    const user = await service.deactivate(userId);

    expect(user.isActive).toBe(false);
    expect(await userRepository.findById(userId)).not.toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test auth-service -- --testPathPattern=users.service`
Expected: FAIL.

**Step 3: Implement the DTO exactly as the API spec defines it**

`register-patient.dto.ts` — copy the decorators from API §2.2.6 verbatim; the zod mirror on the frontend
must match these constraints field-for-field (frontend §5.3):

```typescript
export class RegisterPatientDto {
  @ApiProperty({ example: 'ivanov@example.by' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Иван', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Иванов', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ format: 'password', example: 'Str0ng!Pass' })
  @IsStrongPassword({ minLength: 10, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })
  password: string;

  @ApiProperty({ format: 'date', example: '1990-05-12' })
  @IsDateString()
  birthDate: string;

  @ApiPropertyOptional({ enum: ['male', 'female'] })
  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';
}
```

`update-user.dto.ts`:

```typescript
export class UpdateUserDto extends PartialType(OmitType(RegisterPatientDto, ['password'] as const)) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  roles?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

`registerPatient()` creates the `User`, **creates the `Patient` in HAPI**, writes `ExternalLink`, and
publishes `patient.registered.v1`. Passwords are hashed with `bcrypt` (cost ≥ 10); plaintext is never
logged. `DELETE /admin/users/{id}` is a **soft** deactivation (`isActive=false`), never a row removal —

# M2 — Catalog (read side)

## Task 8: `libs/fhir`, `libs/fhir-mappers`, `libs/terminology`

**Files:**

- Create: `libs/fhir/src/lib/fhir-client.provider.ts`, `libs/fhir/src/index.ts`
- Create: `libs/fhir-mappers/src/lib/{slot,appointment,practitioner}.mapper.ts`, `libs/fhir-mappers/src/index.ts`
- Create: `libs/terminology/src/lib/canonical-urls.ts`, `libs/terminology/src/lib/validators/{icd10,atc,ucum}.ts`
- Test: `libs/terminology/src/lib/validators/terminology.spec.ts`, `libs/fhir-mappers/src/lib/slot.mapper.spec.ts`

**Step 1: Write the failing test**

```typescript
// libs/terminology/src/lib/validators/terminology.spec.ts
describe('isValidIcd10Code', () => {
  it.each(['J06.9', 'J01FA10', 'M54.5', 'A00'])('should accept %s', (code) => {
    expect(isValidIcd10Code(code)).toBe(true);
  });

  it.each(['j06.9', 'X99', 'J6', ''])('should reject %s', (code) => {
    expect(isValidIcd10Code(code)).toBe(false);
  });
});

describe('isValidAtcCode', () => {
  it.each(['J01FA10', 'N02BE01'])('should accept %s', (code) => {
    expect(isValidAtcCode(code)).toBe(true);
  });

  it.each(['J01FA1', 'abcde', ''])('should reject %s', (code) => {
    expect(isValidAtcCode(code)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test terminology`
Expected: FAIL.

**Step 3: Write the implementation**

`libs/terminology/src/lib/canonical-urls.ts` — the single place where `fhir.by` URLs live (ADR-002):

```typescript
export const FHIR_BY = {
  ICD10_VALUE_SET: 'https://fhir.by/ValueSet/InternClassificDiseases10',
  SERVICE_CODE_SYSTEM: 'https://fhir.by/CodeSystem/nsi-services',
  OBSERVATION_CODE_SYSTEM: 'https://fhir.by/CodeSystem/nsi-observations',
  ATC_CODE_SYSTEM: 'http://www.whocc.no/atc',
  UCUM_SYSTEM: 'http://unitsofmeasure.org',
} as const;
```

`icd10.ts` — the regex guard mirrors the frontend mask `^[A-Z]\d{2}(\.\d{1,2})?$` from frontend §4; the
**authoritative** check remains the server-side `$expand` against the seeded ValueSet (BR-004):

```typescript
const ICD10_PATTERN = /^[A-Z]\d{2}(\.\d{1,2})?$/;

export function isValidIcd10Code(code: string): boolean {
  return ICD10_PATTERN.test(code);
}
```

`atc.ts` — pattern per frontend §5.3:

```typescript
const ATC_PATTERN = /^[A-Z][0-9]{2}[A-Z]{2}([0-9]{2}[A-Z]{2})?$/;

export function isValidAtcCode(code: string): boolean {
  return ATC_PATTERN.test(code);
}
```

`ucum.ts` exposes `isKnownUcumUnit(unit: string, expanded: ReadonlySet<string>): boolean` — a **closed**
set lookup (BR-009 forbids free-text units).

`libs/fhir/src/lib/fhir-client.provider.ts` provides one `fhir-kit-client` instance per service, pointed
at the internal HAPI URL, configured with the service's client credentials. Credentials come from env
only — never hard-coded, never committed.

`libs/fhir-mappers` implements the two-way mapping pair every clinical service uses:
`XToFhirMapper` (domain → FHIR resource) and `FhirToXMapper` (FHIR → response DTO). Example:

```typescript
// libs/fhir-mappers/src/lib/slot.mapper.ts
export function toSlotResponseDto(slot: Slot): SlotResponseDto {
## Task 9: `practitioner-service` — doctors, organization, rooms (FR-002/016/017)

**Files:**
- Create: `apps/practitioner-service/src/modules/doctors/{doctors.controller,doctors.service}.ts`
- Create: `apps/practitioner-service/src/modules/rooms/{rooms.controller,rooms.service}.ts`
- Create: `apps/practitioner-service/src/modules/rooms/dto/{create-room,update-room}.dto.ts`
- Create: `apps/practitioner-service/src/modules/{doctors,rooms}/dto/room-response.dto.ts`
- Test: `apps/practitioner-service/src/modules/rooms/rooms.service.spec.ts`, `apps/practitioner-service/test/rooms.e2e-spec.ts`

Implements API 4.1–4.2 (read) and 4.3–4.7 (admin CRUD, FR-017). `Location.physicalType=room` is the
room discriminator.

**Step 1: Write the failing test**

```typescript
describe('RoomsService', () => {
  it('should refuse to delete a room referenced by an active schedule', async () => {
    fhirClient.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Schedule' } }] });

    await expect(roomsService.remove(roomId)).rejects.toThrow('ROOM_IN_USE');
  });

  it('should delete a Location when no schedule references it', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });

    await expect(roomsService.remove(roomId)).resolves.toBeUndefined();
    expect(fhirClient.delete).toHaveBeenCalledWith('Location', roomId);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test practitioner-service`
Expected: FAIL.

**Step 3: Implement**

`RoomsService.remove()` searches `Schedule?location=Location/{id}` first; a non-empty result throws
`409 ROOM_IN_USE` — busy slots are protected (BR-001). Controllers use `@ApiTags('practitioner')` and
`@ApiBearerAuth()`; admin routes carry `@RequiresRoles(Role.ADMIN)` (BR-007).

**Step 4: Run tests to verify they pass**

Run: `npx nx test practitioner-service`
Expected: PASS.

**Step 5: Copy the JWT perimeter e2e test here**

`apps/practitioner-service/test/jwt-perimeter.e2e-spec.ts` must assert 401 without a token — every
service carries this file (ADR-009).

## Task 10: `catalog-service` — services, schedules, slot generation (FR-003/016/020)

**Files:**

- Create: `apps/catalog-service/src/modules/services/{services.controller,services.service}.ts`
- Create: `apps/catalog-service/src/modules/schedules/{schedules.controller,schedules.service,slot-generator.service}.ts`
- Create: `apps/catalog-service/src/modules/schedules/dto/{create-schedule,update-schedule,weekly-window,generate-slots}.dto.ts`
- Create: `apps/catalog-service/src/modules/cache/redis-cache.service.ts`
- Test: `apps/catalog-service/src/modules/schedules/slot-generator.service.spec.ts`, `apps/catalog-service/test/schedules.e2e-spec.ts`

**Step 1: Write the failing tests**

```typescript
describe('SlotGeneratorService', () => {
  it('should not duplicate slots that already exist', async () => {
    fhirClient.search.mockResolvedValue({ entry: [{ resource: { id: 'slot-1' } }] });

    const result = await generator.generate(scheduleId, { from: '2026-11-01', to: '2026-11-02' });

    expect(result.skipped).toBe(1);
    expect(result.generated).toBe(0);
  });

  it('should reject a range longer than the 90-day planning horizon', async () => {
    await expect(generator.generate(scheduleId, { from: '2026-01-01', to: '2026-12-31' }))
      .rejects.toThrow('planningHorizon');
  });

  it('should reject overlapping weekly windows for the same practitioner role', async () => {
    await expect(schedulesService.create(overlappingDto)).rejects.toThrow('SCHEDULE_OVERLAP');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test catalog-service`
Expected: FAIL.

**Step 3: Implement**

`slot-generator.service.ts` expands each `Schedule.planningHorizon` weekly window
(`daysOfWeek` × `startTime`–`endTime`, stepped by `slotDurationMin`) into R4 `Slot` resources with
`status=free`, **skipping any slot id that already exists** so repeated generation is safe (ADR-015:
our HAPI is the single source of schedule truth; real-time sync is out of scope).

`services.create()` validates each `HealthcareService.type` against the seeded НСИ ValueSet
(`FHIR_BY.SERVICE_CODE_SYSTEM`) and rejects unknown codes with `422 TERMINOLOGY_NOT_FOUND`.

`redis-cache.service.ts` caches `catalog:services`, `catalog:doctors:{service}` (TTL 5 min) and
`slots:{schedule}:{from}:{to}` (TTL 15 s), invalidated on schedule/slot events — this is what holds
NFR-005 (< 500 ms slot search).

`POST /admin/schedules/{id}/generate` honours `Idempotency-Key` (Redis, TTL 24 h) per API §0.

**Step 4: Run tests to verify they pass**

Run: `npx nx test catalog-service`
Expected: PASS.

**Step 5: E2E test the admin flow**

`apps/catalog-service/test/schedules.e2e-spec.ts`: ADMIN creates a schedule → generates slots → asserts
`{ generated, skipped }`; a PATIENT token on the same route → 403; regenerate → `skipped` equals the
first `generated`.

Run: `npx nx e2e catalog-service` → Expected: PASS.

**Step 6: Commit**

```bash
git add apps/catalog-service
git commit -m "feat(catalog): add services, schedules and idempotent slot generation with Redis cache"
```

---

## Task 11: `patient-service` — patient profiles and history (FR-001/002/018)

**Files:**

- Create: `apps/patient-service/src/modules/patients/{patients.controller,patients.service}.ts`
- Create: `apps/patient-service/src/modules/patients/dto/patient-response.dto.ts`
- Create: `apps/patient-service/src/modules/related-persons/{related-persons.controller,related-persons.service}.ts`
- Test: `apps/patient-service/src/modules/patients/patients.service.spec.ts`, `apps/patient-service/test/me-patient.e2e-spec.ts`

Implements API 3.1–3.3 plus `/me/patient`.

**Step 1: Write the failing test**

```typescript
describe('PatientsService', () => {
  it('should return the profile of the patient in the JWT context', async () => {
    const profile = await service.getMePatient(claims);

    expect(profile.id).toBe('9f2c');
  });

  it('should reject access to another patient record for a patient-scoped token', async () => {
    await expect(service.getById('someone-else', claims)).rejects.toThrow('COMPARTMENT_VIOLATION');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test patient-service`
Expected: FAIL.

**Step 3: Implement**

`getById()` compares the requested id against `resolvePatientRef(claims)`. A `PATIENT`-role token
requesting a different `Patient/{id}` throws `403 COMPARTMENT_VIOLATION` (ADR-013, BR-006). The
controller **never** reads a `patient` query parameter for `patient/*`-scoped routes.

**Step 4: Run tests to verify they pass**

Run: `npx nx test patient-service` → PASS.

# M3 — Booking (concurrency-critical)

## Task 12: `appointment-service` — booking, cancellation, no-show (FR-004/005/006)

**Files:**

- Create: `apps/appointment-service/src/modules/appointments/{appointments.controller,appointments.service}.ts`
- Create: `apps/appointment-service/src/modules/appointments/dto/{create-appointment,appointment-response,cancel-appointment}.dto.ts`
- Create: `apps/appointment-service/src/modules/idempotency/idempotency.service.ts`
- Create: `apps/appointment-service/src/modules/events/appointment-publisher.service.ts`
- Test: `apps/appointment-service/src/modules/appointments/appointments.service.spec.ts`
- Test: `apps/appointment-service/test/booking-concurrency.e2e-spec.ts`

This is the highest-risk task in the plan. BR-001 says one slot yields at most one active `Appointment`;
ADR-012 fixes the mechanism — re-read the `Slot` under a **pessimistic lock** inside a transaction.

**Step 1: Write the failing tests**

```typescript
describe('AppointmentsService', () => {
  it('should book a free slot and mark it busy', async () => {
    fhirClient.read.mockResolvedValue({ resourceType: 'Slot', id: 'slot-1', status: 'free' });

    const result = await service.create(claims, { slotId: 'slot-1' });

    expect(result.status).toBe('booked');
    expect(fhirClient.update).toHaveBeenCalledWith('Slot', 'slot-1', expect.objectContaining({ status: 'busy' }));
  });

  it('should throw SLOT_CONFLICT when the slot is already busy', async () => {
    fhirClient.read.mockResolvedValue({ resourceType: 'Slot', id: 'slot-1', status: 'busy' });

    await expect(service.create(claims, { slotId: 'slot-1' })).rejects.toThrow('SLOT_CONFLICT');
  });

  it('should refuse to cancel an appointment belonging to another patient', async () => {
    fhirClient.read.mockResolvedValue(appointmentOfOtherPatient);

    await expect(service.cancel(claims, appointmentId, { reason: 'не смог прийти' }))
      .rejects.toThrow('COMPARTMENT_VIOLATION');
  });

  it('should reject a second cancellation with APPOINTMENT_NOT_CANCELLABLE', async () => {
    fhirClient.read.mockResolvedValue({ status: 'cancelled' });

    await expect(service.cancel(claims, appointmentId, { reason: 'не смог прийти' }))
      .rejects.toThrow('APPOINTMENT_NOT_CANCELLABLE');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test appointment-service`
Expected: FAIL.

**Step 3: Implement the transaction (ADR-012)**

`appointments.service.ts`:

```typescript
async create(claims: JwtClaims, dto: CreateAppointmentDto): Promise<AppointmentResponseDto> {
  const patientRef = this.requirePatientRef(claims);
  const slot = await this.fhir.read('Slot', dto.slotId, { lock: 'for-update' });

  if (slot.status !== 'free') {
    throw new ConflictException('SLOT_CONFLICT');
  }

  return this.fhir.transaction(async () => {
    const appointment = await this.fhir.create('Appointment', {
      status: 'booked',
      slot: [{ reference: `Slot/${dto.slotId}` }],
      participant: [
        { actor: { reference: patientRef }, status: 'accepted' },
        { actor: { reference: slot.schedule.reference }, status: 'accepted' },
      ],
      ...(dto.reason ? { reasonCode: [{ text: dto.reason }] } : {}),
    });

    await this.fhir.update('Slot', dto.slotId, { status: 'busy' });
    await this.events.publishBooked(appointment, patientRef);
    await this.audit.record('Appointment', appointment.id, 'create');

    return this.mappers.toResponseDto(appointment);
  });
}
```

Order matters and must not be reordered: **lock → verify `free` → create Appointment → set Slot busy →
publish event → audit.** Publishing before the slot flip would let a consumer observe a booked appointment
on a still-free slot.

`idempotency.service.ts` keys on `Idempotency-Key` in Redis (TTL 24 h): the first call stores the
response, replays return the cached body — so a retried `POST /appointments` never books twice.

`cancel()` checks ownership (patient owner or ADMIN — **not** the doctor, who uses `noshow`), sets
`status=cancelled` + `statusReason`, returns the `Slot` to `free`, and publishes `appointment.cancelled.v1`.

**Step 4: Run tests to verify they pass**

Run: `npx nx test appointment-service`

## Task 13: `notification-service` — RabbitMQ consumer + `Communication` (FR-008)

**Files:**

- Create: `apps/notification-service/src/modules/notifications/{notifications.controller,notifications.service,consumer.service}.ts`
- Create: `apps/notification-service/src/modules/notifications/dto/notification-response.dto.ts`
- Create: `apps/notification-service/src/modules/notifications/deduplication.service.ts`
- Test: `apps/notification-service/src/modules/notifications/consumer.service.spec.ts`, `apps/notification-service/test/notifications.e2e-spec.ts`

**Step 1: Write the failing test**

```typescript
describe('ConsumerService', () => {
  it('should create a Communication for appointment.booked.v1', async () => {
    await consumer.handle(appointmentBookedEvent);

    expect(fhirClient.create).toHaveBeenCalledWith(
      'Communication',
      expect.objectContaining({ status: 'in-progress', recipient: [{ reference: 'Patient/9f2c' }] }),
    );
  });

  it('should ignore a duplicate eventId', async () => {
    await consumer.handle(event);

    await expect(consumer.handle(event)).resolves.toBeUndefined();
    expect(fhirClient.create).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test notification-service`
Expected: FAIL.

**Step 3: Implement**

`consumer.service.ts` binds four queues to the `medical.events` topic exchange, each with a `.dlq`
dead-letter queue. Every handler is **idempotent via `eventId` dedup** (Redis, 7-day TTL) — RabbitMQ is
at-least-once, so duplicates are expected, not exceptional (architect §4.4).

`notifications.service.ts` searches `Communication?recipient=Patient/{id}&_sort=-sent` and filters by
patientRef from the JWT context, never by a query parameter (ADR-013). There is no notification
database: `Communication` in HAPI *is* the store.

**Step 4: Run tests to verify they pass**

Run: `npx nx test notification-service` → PASS.

**Step 5: Commit**

```bash
git add apps/notification-service
git commit -m "feat(notification): add AMQP consumers writing Communication with eventId dedup"
```

# M4 — Clinical

## Task 14: `encounter-service` — open and complete an encounter (FR-010…FR-014)

**Files:**

- Create: `apps/encounter-service/src/modules/encounters/{encounters.controller,encounters.service}.ts`
- Create: `apps/encounter-service/src/modules/encounters/dto/{complete-encounter,encounter-response}.dto.ts`
- Create: `apps/encounter-service/src/modules/encounters/dto/{condition,observation,service-request,medication-request}.dto.ts`
- Create: `apps/encounter-service/src/modules/encounters/mappers/encounter-completion.mapper.ts`
- Create: `apps/encounter-service/src/common/validators/{matches-icd10,matches-atc}.validator.ts`
- Create: `apps/encounter-service/src/modules/history/history.service.ts` (7.4–7.7)
- Test: `apps/encounter-service/src/modules/encounters/encounters.service.spec.ts`, `apps/encounter-service/test/complete-encounter.e2e-spec.ts`

**Step 1: Write the failing tests**

```typescript
describe('EncountersService', () => {
  it('should reject completing an encounter twice', async () => {
    fhirClient.read.mockResolvedValue({ resourceType: 'Encounter', status: 'finished' });

    await expect(service.complete(doctorClaims, encounterId, validDto)).rejects.toThrow('ENCOUNTER_STATE_INVALID');
  });

  it('should reject a diagnosis code outside the seeded ICD-10 ValueSet', async () => {
    await expect(service.complete(doctorClaims, encounterId, dtoWithCode('X99')))
      .rejects.toThrow('INVALID_ICD10_CODE');
  });

  it('should link each prescription to the encounter and its condition', async () => {
    await service.complete(doctorClaims, encounterId, validDto);

    expect(fhirClient.create).toHaveBeenCalledWith(
      'MedicationRequest',
      expect.objectContaining({
        encounter: { reference: `Encounter/${encounterId}` },
        reasonReference: expect.arrayContaining([
          expect.objectContaining({ reference: expect.stringMatching(/^Condition\//) }),
        ]),
      }),
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test encounter-service`
Expected: FAIL.

**Step 3: Implement the atomic completion (API §7.3)**

The DTOs come from API §7.3 verbatim — `CompleteEncounterDto` is deliberately **one** body covering
summary, diagnoses, recommendations, observations, service requests and medication requests.

`encounters.service.ts`:

```typescript
async complete(claims: JwtClaims, encounterId: string, dto: CompleteEncounterDto): Promise<EncounterResponseDto> {
  const encounter = await this.fhir.read('Encounter', encounterId);

  if (encounter.status === 'finished') {
    throw new ConflictException('ENCOUNTER_STATE_INVALID');
  }

  await this.terminology.assertCodesExist(dto.diagnoses.map((d) => d.code), FHIR_BY.ICD10_VALUE_SET);
  await this.terminology.assertUcumUnits(dto.observations.map((o) => o.unit));

  return this.fhir.transaction(async () => {
    const conditions = await Promise.all(dto.diagnoses.map((d) => this.createCondition(d, encounterId)));

    await this.fhir.update('Encounter', encounterId, { status: 'finished', period: { end: nowIso() } });
    await this.createClinicalImpression(dto.summary, conditions, encounterId);
    await this.createCarePlan(dto.recommendations, encounterId);
    await Promise.all((dto.observations ?? []).map((o) => this.createObservation(o, encounterId, conditions[0])));
    await Promise.all((dto.serviceRequests ?? []).map((r) => this.createServiceRequest(r, encounterId, conditions[0])));
    await Promise.all((dto.medicationRequests ?? []).map((m) => this.createMedicationRequest(m, encounterId, conditions[0])));

    await this.events.publishCompleted(encounterId, encounter.subject.reference);
    await this.audit.record('Encounter', encounterId, 'create');

    return { id: encounterId, status: 'finished', period: { /* start, end */ }, diagnosisCodes: dto.diagnoses.map((d) => d.code) };
  });
}
```

Every prescription references both the `Encounter` and the `Condition` — BR-005. Prescribing a drug
outside the seeded АТХ ValueSet, or a free-text UCUM unit, fails with `422` (`INVALID_ICD10_CODE` /
`TERMINOLOGY_NOT_FOUND`) — BR-009.

`history.service.ts` serves 7.4–7.7, always filtering `Encounter?patient=…` by the JWT-context
patientRef for `patient/*` scopes (ADR-013).

**Step 4: Run tests to verify they pass**

Run: `npx nx test encounter-service` → PASS.

**Step 5: E2E test the clinical chain**

`apps/encounter-service/test/complete-encounter.e2e-spec.ts`: book → open encounter → complete with
`J06.9` / `36.6 Cel` / `J01FA10` → assert 200 `finished`, six resource types created,
`encounter.completed.v1` published; replay → 409 `ENCOUNTER_STATE_INVALID`.

# M5 — Analytics

## Task 15: `analytics-service` — read-models, reports, audit log (FR-019/021)

**Files:**

- Create: `apps/analytics-service/src/modules/reports/{reports.controller,reports.service}.ts`
- Create: `apps/analytics-service/src/modules/reports/dto/{appointments-summary,encounters-summary,services-popularity}.dto.ts`
- Create: `apps/analytics-service/src/modules/audit/audit.controller.ts`
- Create: `apps/analytics-service/src/modules/worker/analytics.worker.ts`
- Create: `apps/analytics-service/src/database/entities/{measure-report,audit-event-read}.entity.ts`
- Test: `apps/analytics-service/src/modules/reports/reports.service.spec.ts`, `apps/analytics-service/test/audit.e2e-spec.ts`

**Step 1: Write the failing test**

```typescript
describe('ReportsService', () => {
  it('should reject a date range longer than 366 days', async () => {
    await expect(reportsService.appointmentsSummary({ from: '2024-01-01', to: '2026-12-31' }))
      .rejects.toThrow('range');
  });

  it('should group appointments by status', async () => {
    repository.aggregate.mockResolvedValue([{ status: 'booked', count: '12' }]);

    expect(await reportsService.appointmentsSummary(range)).toEqual({ groups: [{ code: 'booked', count: 12 }] });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test analytics-service`
Expected: FAIL.

**Step 3: Implement**

`analytics.worker.ts` consumes `appointment.booked`, `appointment.cancelled` and `encounter.completed` and
maintains **read-model** tables in a separate PostgreSQL schema (architect §5) — analytics never mutates
clinical FHIR data. All four endpoints require `Role.ADMIN` (BR-007).

`GET /admin/audit` returns `PaginatedResponseDto<AuditEventDto>`; a range over 366 days → `400`.

**Step 4: Run tests to verify they pass**

Run: `npx nx test analytics-service` → PASS.

**Step 5: Commit**

```bash
git add apps/analytics-service
git commit -m "feat(analytics): add read-model reports and audit log endpoints"
```

# M6 — Frontend (Next.js)

## Task 16: `apps/web` — scaffold, design tokens, shells, i18n

**Files:**

- Create: `apps/web/{package.json,project.json,next.config.mjs,tsconfig.json,tailwind.config.ts,playwright.config.ts}`
- Create: `apps/web/src/app/{layout.tsx,error.tsx,not-found.tsx,middleware.ts}`
- Create: `apps/web/src/app/{(public),(auth),(patient),(doctor),(admin)}/layout.tsx`
- Create: `apps/web/src/styles/globals.css` (tokens)
- Create: `apps/web/src/components/layout/{staff-shell,patient-shell,notification-bell,locale-switcher}.tsx`
- Create: `apps/web/src/messages/{ru,en}.json`
- Test: `apps/web/src/components/feedback/stamp-badge.spec.tsx`

**Step 1: Write the failing test**

```tsx
describe('StampBadge', () => {
  it('should render the status label in uppercase', () => {
    render(<StampBadge status="booked" />);

    expect(screen.getByText('BOOKED')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test web`
Expected: FAIL — component not found.

**Step 3: Implement the design system "Медицинская карта"**

`globals.css` — shadcn CSS variables with the exact token values from frontend §0:

```css
:root {
  --background: #faf9f6;   /* тёплая бумага */
  --card: #ffffff;
  --foreground: #1c2b33;   /* чернила */
  --muted-foreground: #5b6770;
  --primary: #0f766e;      /* хирургический бирюзовый */
  --primary-foreground: #ecfdf5;
  --secondary: #f1efe9;
  --accent: #f1efe9;
  --destructive: #b3261e;
  --warning: #b45309;
  --success: #2f6b4f;
  --border: #e5e2d9;
  --input: #e5e2d9;
  --ring: #0f766e;
  --radius: 6px;           /* без теней — глубина только границами */
}
```

Fonts via `next/font`: **PT Serif** 600/700 (headings), **Inter** 400/500/600 (UI), **JetBrains Mono**
(codes, `requestId`), all with `display: swap`. Light theme only — dark mode is a token-level задел.

`StampBadge` renders a status as a rubber stamp: uppercase, tracking +0.08em, 1.5px border, no fill.
`CodeChip` renders terminology codes in JetBrains Mono on `#F3F1EA`. Both are used on nearly every page,
so they are built here rather than later.

`middleware.ts` guards the route groups: no session → redirect `/login?returnTo=<path>`; wrong role → `/403`.

## Task 17: token broker, `apiFetch`, session store, query keys

**Files:**

- Create: `apps/web/src/app/api/auth/{authorize,callback,session,refresh,logout}/route.ts`
- Create: `apps/web/src/lib/api/{api-fetch.ts,problem.ts,query-keys.ts}`
- Create: `apps/web/src/lib/auth/session-store.ts`
- Create: `apps/web/src/store/{use-session-store,use-ui-store,use-booking-draft-store}.ts`
- Create: `libs/contracts/src/schemas/*.schema.ts` (zod mirrors)
- Test: `apps/web/src/lib/api/__tests__/api-fetch.spec.ts`, `libs/contracts/src/schemas/schema-parity.spec.ts`

**Step 1: Write the failing tests**

```typescript
// api-fetch.spec.ts
describe('apiFetch', () => {
  it('should retry once after refreshing the token on 401 UNAUTHENTICATED', async () => {
    fetchMock.mockResolvedValueOnce(problemResponse(401, 'UNAUTHENTICATED')).mockResolvedValueOnce(okResponse());

    await apiFetch('/api/v1/appointments');

    expect(refreshHandler).toHaveBeenCalledTimes(1);
  });

  it('should log out instead of retrying when the error is TOKEN_REVOKED', async () => {
    fetchMock.mockResolvedValueOnce(problemResponse(401, 'TOKEN_REVOKED'));

    await expect(apiFetch('/api/v1/appointments')).rejects.toThrow('TOKEN_REVOKED');
    expect(refreshHandler).not.toHaveBeenCalled();
  });
});
```

```typescript
// schema-parity.spec.ts — frontend §5.3 contract
describe('zod schema parity', () => {
  it('should reject a reason shorter than 3 characters, mirroring class-validator MinLength(3)', () => {
    expect(cancelAppointmentSchema.safeParse({ reason: 'ab' }).success).toBe(false);
  });

  it('should reject an ATC code failing the shared regex', () => {
    const result = medicationRequestSchema.safeParse({ atcCode: 'J01FA1', dosageText: '1 таблетка' });

    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test web` → FAIL.

**Step 3: Implement the broker and the fetch layer**

The five route handlers implement frontend §2 exactly. The security property: **`code_verifier` and the
refresh token never enter browser JavaScript** — `mc_pkce` and `mc_rt` are `httpOnly`, `Secure`,
`SameSite=Lax` cookies (NFR-006).

`api-fetch.ts` implements the single-flight refresh contract:

```typescript
async function refreshOnce(): Promise<boolean> {
  const response = await fetch('/api/auth/refresh', { method: 'POST' });

  return response.ok;
}

export async function apiFetch<TResponse>(path: string, init: RequestInit = {}): Promise<TResponse> {
  const response = await fetchWithBearer(path, init);

  if (response.status === 401) {
    const problem = await response.clone().json();
    if (problem.errorCode === 'TOKEN_REVOKED') {
## Task 18: public + auth + patient route groups (FR-001…FR-008)

**Files:**
- Create: `apps/web/src/app/(public)/{page.tsx,doctors/page.tsx,doctors/[doctorId]/page.tsx}`
- Create: `apps/web/src/app/(auth)/{login,register}/page.tsx`
- Create: `apps/web/src/app/(patient)/{booking,appointments,appointments/[appointmentId],history,prescriptions,profile,notifications}/page.tsx`
- Create: `apps/web/src/components/domain/{slot-picker,booking-wizard,cancel-appointment-dialog,patient-history-timeline,prescription-card,notification-center}.tsx`
- Create: `apps/web/src/components/domain/__tests__/{booking-wizard,slot-picker}.spec.tsx`
- Test: `apps/web/src/store/__tests__/use-booking-draft-store.spec.ts`

**Step 1: Write the failing tests**

```tsx
describe('SlotPicker', () => {
  it('should refetch slots and keep the wizard step when booking conflicts', async () => {
    render(<SlotPicker />);   // slots query returns a free slot; POST /appointments answers 409 SLOT_CONFLICT

    expect(await screen.findByTestId('slot-conflict-toast')).toBeInTheDocument();
    expect(refetchSlots).toHaveBeenCalled();
  });
});
```

```typescript
describe('useBookingDraftStore', () => {
  it('should persist the wizard draft to sessionStorage', () => {
    useBookingDraftStore.getState().setStep(3);

    expect(sessionStorage.getItem('booking-draft')).toContain('"step":3');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test web`
Expected: FAIL.

**Step 3: Implement**

`BookingWizard` is four steps — service → doctor → slot → confirm — with the draft in `sessionStorage`
(key `booking-draft`) so it survives the login redirect, and a UUID `Idempotency-Key` generated **once per
booking intent** and reused on retries (frontend §2). `returnTo` brings the visitor back to step 4 after
authentication.

## Task 19: doctor + admin route groups and the full errorCode→UX map (FR-009…FR-021)

**Files:**

- Create: `apps/web/src/app/(doctor)/{appointments,schedule,patients/[patientId],encounters/[encounterId]}/page.tsx`
- Create: `apps/web/src/app/(admin)/{users,services,rooms,schedules,terminology,analytics,audit}/page.tsx`
- Create: `apps/web/src/components/domain/{encounter-complete-form,icd10-combobox,atc-code-field,ucum-unit-select,noshow-button,doctor-schedule-view,schedule-editor,slot-generation-dialog,users-table,analytics-dashboard,audit-table,room-usage-drawer,terminology-import-panel}.tsx`
- Create: `apps/web/src/components/feedback/problem-banner.tsx`
- Create: `apps/web/src/lib/error-code-map.ts`
- Test: `apps/web/src/components/domain/__tests__/encounter-complete-form.spec.tsx`, `apps/web/src/lib/__tests__/error-code-map.spec.ts`

**Step 1: Write the failing tests**

```tsx
describe('EncounterCompleteForm', () => {
  it('should become read-only after the encounter is finished', () => {
    render(<EncounterCompleteForm encounter={finishedEncounter} />);

    expect(screen.getByRole('textbox', { name: /резюме/i })).toBeDisabled();
  });

  it('should reject a UCUM unit that is not in the ValueSet', async () => {
    render(<EncounterCompleteForm encounter={inProgressEncounter} />);

    expect(await screen.findByText(/неизвестная единица/i)).toBeInTheDocument();
  });
});
```

```typescript
// error-code-map.spec.ts — the 16/16 coverage promise from frontend §5.4
describe('errorCodeMap', () => {
  it('should map every ErrorCode to a UX handler', () => {
    for (const code of ERROR_CODES) {
      expect(Object.keys(errorCodeMap)).toContain(code);
    }
  });

  it('should surface COMPARTMENT_VIOLATION as a 404, not a 403', () => {
    expect(errorCodeMap.COMPARTMENT_VIOLATION.view).toBe('not-found');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx nx test web`
Expected: FAIL.

**Step 3: Implement**

`EncounterCompleteForm` has four sections — summary + diagnoses, observations, prescriptions,
recommendations — submitting the **atomic** `CompleteEncounterDto`. After `finished` it renders read-only
with a status banner (BR-003/BR-008). `Icd10Combobox` queries the ValueSet `$expand` (API 2.3.2) with an
offline fallback to `GET /terminology/validate` (2.3.3); `UcumUnitSelect` offers only known units and
refuses free text (BR-009).

`error-code-map.ts` implements all 16 mappings from frontend §5.4 verbatim. Two are easy to get wrong and
are pinned by the tests above: `COMPARTMENT_VIOLATION` renders as **404** (never reveal that another
patient's resource exists), and `SLOT_CONFLICT` triggers a slot refetch rather than a generic error page.

`AuditTable` shows `requestId` in mono with a copy button, so a user-reported error maps to a pino log line.

**Step 4: Run tests to verify they pass**

# M7 — Verification and course artifacts

## Task 20: Playwright E2E — the scenarios of frontend §6 (NFR-011)

**Files:**

- Create: `apps/web/e2e/{booking-flow,booking-conflict,cancel-appointment,doctor-encounter,admin-schedule,notifications-analytics}.spec.ts`
- Create: `apps/web/e2e/{security.spec.ts,fixtures/auth.fixtures.ts,fixtures/seed.ts}`
- Create: `apps/web/playwright.config.ts` (baseURL → Traefik)

**Step 1: Write the failing tests**

```typescript
// apps/web/e2e/booking-conflict.spec.ts — scenario A2
test('should surface SLOT_CONFLICT when two bookings race for one slot', async ({ browser }) => {
  const [pageA, pageB] = await Promise.all([loginAsPatient(browser), loginAsPatient(browser)]);
  await Promise.all([
    pageA.goto(`/booking?slot=${freeSlotId}`),
    pageB.goto(`/booking?slot=${freeSlotId}`),
  ]);
  await Promise.all([confirm(pageA), confirm(pageB)]);

  await expect(
    pageA.getByTestId('slot-conflict-toast').or(pageB.getByTestId('slot-conflict-toast')),
  ).toBeVisible();
});
```

**Step 2: Run to verify it fails**

Run: `npx nx e2e web --project=chromium`
Expected: FAIL — app not wired to the stack yet.

**Step 3: Implement the scenarios against the compose stack**

| Scenario | Asserts                                                                                    | Spec source                     |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------- |
| A        | guest → slot → login → draft restored → confirm → 201                                 | FR-002…004, PKCE`returnTo`   |
| A2       | concurrent booking → 409`SLOT_CONFLICT` + slot refetch                                  | BR-001                          |
| B        | patient cancels with reason →`cancelled` + notification                                 | BR-002                          |
| C        | doctor: journal → open → complete (`J06.9`, `36.6 Cel`, `J01FA10`) → `finished` | FR-011…014, BR-004/005/008/009 |
| C2       | replay complete → 409 → read-only form                                                   | BR-003/008                      |
| D        | admin creates schedule, generates slots; visible to doctor and patient                     | FR-020                          |
| E        | unread-count polling + mark read                                                           | FR-008                          |
| F        | analytics + audit with filters                                                             | FR-019/021                      |

**Step 4: Add the security E2E suite**

`apps/web/e2e/security.spec.ts` asserts the ADR-013 rule from the client side: a `patient/*`-scoped UI
never sends a `patient` query parameter, and a patient token receives 403 on `/admin/*`.

**Step 5: Run the full suite**

Run: `npx nx e2e web`
Expected: all scenarios PASS.

## Task 21: course artifacts — ПЗ, draw.io diagrams, Swagger/Bruno, docs

**Files:**

- Create: `docs/pz/medcenter-pz.docx` (расчётно-пояснительная записка)
- Create: `docs/diagrams/{usecase,logical-db,structural}.drawio`
- Create: `docs/api/capability-statement.json` (exported from HAPI)
- Create: `bruno/medcenter-api/` collection
- Modify: `CHANGELOG.md`, `specs/MANIFEST.md`, `README.md`

**Step 1: Export the CapabilityStatement**

Run: `curl -s localhost:8080/fhir/metadata > docs/api/capability-statement.json && jq -r '.fhirVersion' docs/api/capability-statement.json`
Expected: `4.0.1` (NFR-003 / NFR-010).

**Step 2: Author the three draw.io diagrams**

`docs/diagrams/usecase.drawio` — actors Пациент / Врач / Администратор with use cases mapped to FR-001…021.
`docs/diagrams/logical-db.drawio` — schema `auth` tables **plus** the FHIR R4 resource set held by HAPI
(`Patient`, `Appointment`, `Slot`, `Encounter`, `Condition`, `MedicationRequest`, `Communication`,
`AuditEvent`, `CodeSystem`/`ValueSet`), with slot→appointment→encounter reference arrows shown.
`docs/diagrams/structural.drawio` — Traefik → 8 BFF services → HAPI/PostgreSQL/Redis/RabbitMQ, with
`x-request-id` propagation and the JWT verification point marked **inside each service** (ADR-009).

**Step 3: Write the ПЗ**

`docs/pz/medcenter-pz.docx` sections: введение → постановка задачи → требования (FR/NFR/BR) →
архитектура и ADR → структура схемы → API → диаграммы → тестирование (с результатами прогонов) →
заключение. Build it with the `word-document-server` tools. Every diagram must match the shipped code —
if implementation diverged from this plan, the diagram is redrawn, not the code excused.

**Step 4: Export the OpenAPI specs and the Bruno collection**

Run: `for s in auth patient practitioner catalog appointment encounter notification analytics; do curl -s "localhost/api/docs/$s-json" -o "bruno/medcenter-api/openapi-$s.json"; done`
Collection files are named `api-designer-*.bru` (AGENTS.md prefix rule).

**Step 5: Update the docs**

`CHANGELOG.md` (Keep a Changelog format), `specs/MANIFEST.md` (refresh "Last Updated" and the
`docs-generator-implementation.md` row), `README.md` (run instructions).

**Step 6: Commit**

```bash
git add docs bruno CHANGELOG.md specs/MANIFEST.md README.md
git commit -m "docs: add course artifacts (ПЗ, draw.io diagrams, CapabilityStatement, Bruno collection)"
```

---

**Step 6: Commit**

```bash
git add apps/web/e2e apps/web/playwright.config.ts
git commit -m "test(e2e): add Playwright scenarios for booking, encounter, schedule and audit flows"
```

---

Run: `npx nx test web` → PASS.

**Step 5: Accessibility check (frontend §7)**

Verify manually or via `browser-verify`: skip-link present, focus-visible ring 2px `--ring`, focus traps in
dialogs, `aria-live` on toasts and the slot conflict, explicit `<label>` on every input, body contrast 13:1.

**Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): add doctor and admin consoles with full errorCode to UX map"
```

**M6 gate:** 5 route groups render under their role guards · 16/16 `errorCode` mapped · booking conflict,
cancelled appointment and finished encounter each degrade gracefully · WCAG 2.1 AA checks pass.

---

`SlotPicker` uses `staleTime: 15 s` plus `refetchOnWindowFocus`. On `409 SLOT_CONFLICT` it invalidates the
`slots` key, keeps the wizard step, announces via `aria-live`, and highlights the taken slot (BR-001).

`CancelAppointmentDialog` requires a 3–500 character reason validated by the zod schema (BR-002).

Date handling is centralised in `lib/format/datetime.ts`: API values are RFC 3339 UTC, rendered through
`Intl.DateTimeFormat` with `timeZone: 'Europe/Minsk'`. Never parse-and-reformat by hand.

**Step 4: Run tests to verify they pass**

Run: `npx nx test web` → PASS.

**Step 5: Commit**

```bash
git add apps/web/src/app apps/web/src/components/domain apps/web/src/store
git commit -m "feat(web): add patient booking flow with slot conflict recovery"
```

---

      await logout();
      throw new ProblemError(problem);
    }
    if (await refreshOnce()) {
      return (await fetchWithBearer(path, init)).json() as TResponse;
    }
    await logout();
  }

  return handleResponse<TResponse></tresponse>(response);
}

```

Retries apply **only to idempotent GETs** (frontend §8); mutations must carry an explicit
`Idempotency-Key` instead. `query-keys.ts` uses the `[domain, ...identity, params]` convention from
frontend §5.1 so Task 19's invalidation table maps one-to-one.

**Step 4: Run tests to verify they pass**

Run: `npx nx test web && npx nx test contracts` → PASS.

**Step 5: Commit**

```bash
git add apps/web/src/app/api apps/web/src/lib apps/web/src/store libs/contracts/src/schemas
git commit -m "feat(web): add PKCE token broker, apiFetch with single-flight refresh and zod parity"
```

**M6a gate:** a full browser login → `mc_rt` is `httpOnly` · `GET /api/v1/appointments` survives an
expired access token via one silent refresh · a revoked token logs out instead of retrying.

---

`messages/ru.json` namespaces: `common`, `booking`, `doctor`, `admin`, `errors` — the last holding all 16
`errorCode` keys, so Task 19 can wire the map without inventing copy.

**Step 4: Run tests to verify they pass**

Run: `npx nx test web` → PASS.

**Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add Next.js shell with medical-record design tokens and i18n"
```

---

**M5 gate:** all 8 BFF services exist and pass `npx nx run-many --target=test --all` · audit events from
auth, appointment and encounter appear in `/admin/audit` · 366-day range guard enforced.

---

Run: `npx nx e2e encounter-service` → Expected: PASS.

**Step 6: Commit**

```bash
git add apps/encounter-service
git commit -m "feat(encounter): add atomic encounter completion with ICD-10, ATC and UCUM validation"
```

**M4 gate:** one request creates Encounter + ClinicalImpression + Condition(s) + CarePlan + Observation(s)

+ ServiceRequest(s)/MedicationRequest(s) · replay rejected 409 · invalid ICD-10 / АТХ / UCUM rejected 422.

---

**M3 gate:** concurrent booking of one slot yields exactly one 201 + one 409 `SLOT_CONFLICT` · replay of
the same `Idempotency-Key` returns the cached response, not a second booking · cancel frees the slot and
emits `appointment.cancelled.v1` · duplicate events produce no duplicate `Communication`.

---

Expected: PASS.

**Step 5: Prove the race is actually handled**

`apps/appointment-service/test/booking-concurrency.e2e-spec.ts` fires **two** concurrent
`POST /appointments` for the same slot and asserts exactly one 201 and exactly one 409 `SLOT_CONFLICT`.
This is BR-001's acceptance test; a mock-only unit test cannot prove it.

Run: `npx nx e2e appointment-service` → Expected: PASS.

**Step 6: Commit**

```bash
git add apps/appointment-service
git commit -m "feat(appointment): add slot booking with pessimistic lock and idempotency key"
```

---

**Step 5: Commit**

```bash
git add apps/patient-service
git commit -m "feat(patient): add patient profile endpoints with compartment enforcement"
```

**M2 gate:** doctors/services/slots queryable with Redis cache · slot generation idempotent and
non-duplicating · 90-day horizon and `SCHEDULE_OVERLAP` enforced · compartment violation returns 403.

---

Run: `npx nx e2e practitioner-service` → Expected: PASS.

**Step 6: Commit**

```bash
git add apps/practitioner-service
git commit -m "feat(practitioner): add doctor catalog and room CRUD with ROOM_IN_USE guard"
```

---

  return {
    id: slot.id ?? '',
    scheduleId: slot.schedule.reference.split('/')[1] ?? '',
    start: slot.start ?? '',
    end: slot.end ?? '',
    status: slot.status === 'busy' ? 'busy' : 'free',
  };
}

```

**Step 4: Run tests to verify they pass**

Run: `npx nx test terminology && npx nx test fhir-mappers`
Expected: PASS.

**Step 5: Commit**

```bash
git add libs/fhir libs/fhir-mappers libs/terminology
git commit -m "feat(terminology): add fhir.by canonical URLs with ICD-10, ATC and UCUM validators"
```

---

audit history must survive.

All mutating routes (2.2.1–2.2.5) write an `AuditEvent` to HAPI (FR-021, ADR-014).

**Step 4: Run tests to verify they pass**

Run: `npx nx test auth-service`
Expected: PASS.

**Step 5: E2E-test the compartment and role rules**

`apps/auth-service/test/users.e2e-spec.ts`: with a PATIENT token, `GET /api/v1/admin/users` → 403
`FORBIDDEN_ROLE`; `DELETE /admin/users/{other}` → 403; with an ADMIN token → 204.

Run: `npx nx e2e auth-service`
Expected: PASS.

**Step 6: Commit**

```bash
git add apps/auth-service/src/modules/users apps/auth-service/src/modules/audit
git commit -m "feat(auth): add user CRUD, patient self-registration with FHIR link and audit events"
```

**M1 gate:** full PKCE round trip works · single-use authorization code enforced · refresh rotation puts
the old `jti` on the Redis denylist · patient token cannot reach any `/admin/*` route.

---

Run: `npx nx test auth-service`
Expected: PASS.

**Step 5: E2E test the full PKCE round trip**

`apps/auth-service/test/oauth.e2e-spec.ts`: register a user → `GET /oauth/authorize?code_challenge=…` →
capture the 302 `code` → `POST /oauth/token` with `code_verifier` → assert 200 with `access_token`,
`refresh_token`, `patient`; then **replay the same code** → assert 400 `invalid_grant` (single-use code).

Run: `npx nx e2e auth-service`
Expected: PASS.

**Step 6: Commit**

```bash
git add apps/auth-service/src/modules/oauth apps/auth-service/test
git commit -m "feat(auth): implement SMART on FHIR authorize/token/revoke/jwks with PKCE S256"
```

---

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

```

Migration `1700000000000-Init.ts` creates schema `auth` and the six tables, with a **unique index** on
`external_link(user_id, resource_type)` so a user cannot be linked to two FHIR identities.

**Step 4: Run test to verify it passes**

Run: `npx nx test auth-service -- --testPathPattern=user.repository`
Expected: PASS — 2 tests.

**Step 5: Commit**

```bash
git add apps/auth-service/src/database apps/auth-service/src/modules/users
git commit -m "feat(auth): add auth schema entities and user repository"
```

---

## Definition of Done — final gate

Run all of these before declaring TASK-001 complete; paste the output into the Context Summary.

```bash
npx nx run-many --target=test --all      # all unit + integration suites green
npx nx run-many --target=lint --all      # zero lint errors
npx nx run-many --target=build --all     # all 9 apps build
npx tsc --noEmit -p tsconfig.base.json   # strict, zero errors
npx nx e2e web                           # Playwright scenarios + security suite
docker compose up -d --wait              # >= 6 containers healthy
grep -rn "TODO\|FIXME\|HACK" apps libs tools | grep -v node_modules   # expect: no output
git status --short                        # expect: clean
```

Manual review checklist:

- [ ] No non-FHIR-International profiles or foreign national terminologies anywhere (AGENTS.md)
- [ ] No `any`, no `!` non-null assertions in authored code (GOLDEN-PRINCIPLES)
- [ ] Every service has `test/jwt-perimeter.e2e-spec.ts` (ADR-009)
- [ ] `.env` is git-ignored; no secrets committed
- [ ] `Idempotency-Key` present on `POST /appointments` and slot generation
- [ ] 16/16 `errorCode` values mapped in `error-code-map.ts`
- [ ] `tasks/.task-counter` unchanged — the task number was supplied as `TASK-001`

---

## Traceability — FR to task

| FR     | Task             | Key mechanism                                          |
| ------ | ---------------- | ------------------------------------------------------ |
| FR-001 | 6, 7, 11, 16, 17 | SMART PKCE,`ExternalLink`, `/me`                   |
| FR-002 | 9, 10            | `Practitioner` + `HealthcareService` search        |
| FR-003 | 8, 10, 18        | `Slot?status=free` + Redis 15 s cache                |
| FR-004 | 12, 18           | pessimistic lock,`Idempotency-Key`                   |
| FR-005 | 12, 18           | `status=cancelled` + `statusReason` (BR-002)       |
| FR-006 | 11, 12, 18       | compartment-filtered`Appointment`/`Encounter`      |
| FR-007 | 14, 18           | `ServiceRequest`/`MedicationRequest` read views    |
| FR-008 | 13, 18           | `Communication` + 30 s unread polling (ADR-015)      |
| FR-009 | 10, 19           | `DoctorScheduleView`, doctor appointment journal     |
| FR-010 | 11, 14, 19       | `/patients/[id]` history timeline                    |
| FR-011 | 14, 19           | `Encounter.status=finished`                          |
| FR-012 | 8, 14, 19        | `Condition` + `InternClassificDiseases10` ValueSet |
| FR-013 | 14, 19           | `CarePlan` recommendations                           |
| FR-014 | 8, 14, 19        | `MedicationRequest` + АТХ/UCUM validation         |
| FR-015 | 7, 19            | `admin/users` CRUD, soft delete                      |
| FR-016 | 10, 19           | `HealthcareService` CRUD                             |
| FR-017 | 9, 19            | `Location` CRUD + `ROOM_IN_USE`                    |
| FR-018 | 8, 15, 19        | seed +`$expand` + snapshot importer                  |
| FR-019 | 15, 19           | read-model aggregates                                  |
| FR-020 | 10, 19           | `Schedule` CRUD + slot generation                    |
| FR-021 | 7, 15, 19        | `AuditEvent` on every mutation                       |

**Risk register for implementation**

| Risk                                | Mitigation in this plan                                                    |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Double-booking under concurrency    | Task 12 pessimistic lock + Task 20 scenario A2                             |
| Compartment leak                    | `resolvePatientRef` (Task 3), per-service checks, Task 20 security suite |
| Forgotten guard in a new service    | `APP_GUARD` global registration + perimeter e2e per service              |
| Terminology drift vs`fhir.by`     | Seed preserves canonical; bind by`system`/`code` only (ADR-017)        |
| Token leakage in the browser        | httpOnly cookies + token broker (Task 17)                                  |
| Scope creep into real-time schedule | Explicitly out of scope (ADR-015); polling instead                         |

---

## Next Steps

**Plan complete and saved to `tasks/TASK-001/writing-plans-plan.md`** — 21 tasks across 8 milestones
(M0 foundation → M7 verification), each with exact file paths, TDD steps, runnable commands with expected
output, and a commit.

**1. Isolated workspace (recommended)** — `/git-worktrees TASK-001` creates an isolated worktree, then
`/coder TASK-001` implements task by task, committing at each of the 21 gates.

**2. Implement in the current workspace** — `/coder TASK-001` starts on the current branch.

**Which approach?**
---------------
