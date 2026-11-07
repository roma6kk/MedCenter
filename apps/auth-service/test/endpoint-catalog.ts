import { Role } from '@medcenter/contracts';

type Body = Readonly<Record<string, unknown>>;

export const UNKNOWN_USER_ID = '3f2c9a2e-8a0b-4f55-9d34-2f4a6f0b9b11';
export const ICD10_VALUE_SET = 'https://fhir.by/ValueSet/InternClassificDiseases10';
export const ICD10_SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';

export interface Reached {
  readonly status: number;
  readonly path?: string;
  readonly body?: Body;
}

export interface ProtectedEndpoint {
  readonly name: string;
  readonly method: 'get' | 'post' | 'patch' | 'delete';
  readonly route: string;
  readonly path: string;
  readonly body?: Body;
  readonly role: Role.ADMIN | null;
  readonly scope: 'user/*.read' | 'user/*.write' | null;
  readonly reached: Reached;
}

const NEW_USER: Body = {
  email: 'created@medcenter.by',
  firstName: 'Пётр',
  lastName: 'Петров',
  password: 'D0ctor!Passw0rd',
  roles: [Role.DOCTOR],
};

export const PROTECTED_ENDPOINTS: ReadonlyArray<ProtectedEndpoint> = [
  {
    name: 'POST /api/v1/admin/users',
    method: 'post',
    route: '/api/v1/admin/users',
    path: '/api/v1/admin/users',
    body: NEW_USER,
    role: Role.ADMIN,
    scope: 'user/*.write',
    reached: { status: 400, body: {} },
  },
  {
    name: 'GET /api/v1/admin/users',
    method: 'get',
    route: '/api/v1/admin/users',
    path: '/api/v1/admin/users',
    role: Role.ADMIN,
    scope: 'user/*.read',
    reached: { status: 200 },
  },
  {
    name: 'GET /api/v1/admin/users/:id',
    method: 'get',
    route: '/api/v1/admin/users/:id',
    path: `/api/v1/admin/users/${UNKNOWN_USER_ID}`,
    role: Role.ADMIN,
    scope: 'user/*.read',
    reached: { status: 404 },
  },
  {
    name: 'PATCH /api/v1/admin/users/:id',
    method: 'patch',
    route: '/api/v1/admin/users/:id',
    path: `/api/v1/admin/users/${UNKNOWN_USER_ID}`,
    body: { lastName: 'Сидоров' },
    role: Role.ADMIN,
    scope: 'user/*.write',
    reached: { status: 404 },
  },
  {
    name: 'DELETE /api/v1/admin/users/:id',
    method: 'delete',
    route: '/api/v1/admin/users/:id',
    path: `/api/v1/admin/users/${UNKNOWN_USER_ID}`,
    role: Role.ADMIN,
    scope: 'user/*.write',
    reached: { status: 404 },
  },
  {
    name: 'GET /api/v1/terminology/value-sets',
    method: 'get',
    route: '/api/v1/terminology/value-sets',
    path: '/api/v1/terminology/value-sets',
    role: Role.ADMIN,
    scope: 'user/*.read',
    reached: { status: 200 },
  },
  {
    name: 'GET /api/v1/terminology/value-sets/:url/$expand',
    method: 'get',
    route: '/api/v1/terminology/value-sets/:url/$expand',
    path: `/api/v1/terminology/value-sets/${encodeURIComponent(ICD10_VALUE_SET)}/$expand`,
    role: null,
    scope: 'user/*.read',
    reached: { status: 200 },
  },
  {
    name: 'GET /api/v1/terminology/expand',
    method: 'get',
    route: '/api/v1/terminology/expand',
    path: `/api/v1/terminology/expand?system=${encodeURIComponent(ICD10_VALUE_SET)}`,
    role: null,
    scope: 'user/*.read',
    reached: { status: 200 },
  },
  {
    name: 'GET /api/v1/terminology/validate',
    method: 'get',
    route: '/api/v1/terminology/validate',
    path: `/api/v1/terminology/validate?system=${encodeURIComponent(ICD10_SYSTEM)}&code=J06.9`,
    role: null,
    scope: 'user/*.read',
    reached: { status: 200 },
  },
  {
    name: 'POST /api/v1/admin/terminology/import',
    method: 'post',
    route: '/api/v1/admin/terminology/import',
    path: '/api/v1/admin/terminology/import',
    body: { snapshotVersion: '1.4.463' },
    role: Role.ADMIN,
    scope: 'user/*.write',
    reached: { status: 400, body: {} },
  },
  {
    name: 'GET /api/v1/me',
    method: 'get',
    route: '/api/v1/me',
    path: '/api/v1/me',
    role: null,
    scope: null,
    reached: { status: 200 },
  },
  {
    name: 'POST /oauth/token/revoke',
    method: 'post',
    route: '/oauth/token/revoke',
    path: '/oauth/token/revoke',
    body: { refreshToken: 'unknown-refresh-token' },
    role: null,
    scope: null,
    reached: { status: 200 },
  },
];

export const PUBLIC_ROUTES: ReadonlyArray<string> = [
  'GET /',
  'GET /health',
  'GET /.well-known/smart-configuration',
  'GET /.well-known/jwks.json',
  'GET /oauth/authorize',
  'POST /oauth/login',
  'POST /oauth/token',
  'POST /api/v1/auth/register',
];
