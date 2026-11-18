// The password sits behind a method and is left out of toJSON, so logs and traces never leak it.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type DemoRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

interface ManifestAccount {
  readonly role: string;
  readonly email: string;
  readonly password?: string;
  readonly practitionerRoleId?: string;
}

interface DemoManifest {
  readonly users?: { readonly accounts?: ReadonlyArray<ManifestAccount> };
}

export const DEFAULT_MANIFEST_PATH = resolve(__dirname, '../../../tools/demo-seed/output/demo-manifest.json');

export const ROLE_LANDING: Readonly<Record<DemoRole, string>> = {
  PATIENT: '/home',
  DOCTOR: '/doctor/appointments',
  ADMIN: '/admin/analytics',
};

export class DemoAccount {
  constructor(
    readonly role: DemoRole,
    readonly email: string,
    private readonly secret: string,
    readonly practitionerRoleId?: string,
  ) {}

  password(): string {
    return this.secret;
  }

  toJSON(): { readonly role: DemoRole; readonly email: string } {
    return { role: this.role, email: this.email };
  }
}

export function manifestPath(): string {
  return process.env['DEMO_MANIFEST_PATH'] ?? DEFAULT_MANIFEST_PATH;
}

export function hasDemoManifest(): boolean {
  return existsSync(manifestPath());
}

function readAccounts(): ReadonlyArray<ManifestAccount> {
  const manifest = JSON.parse(readFileSync(manifestPath(), 'utf8')) as DemoManifest;
  return manifest.users?.accounts ?? [];
}

export function loadDemoAccount(role: DemoRole, index = 0): DemoAccount {
  const candidates = readAccounts().filter((account) => account.role === role && typeof account.password === 'string');
  const found = candidates[index];
  if (found?.password === undefined) {
    throw new Error(`No ${role} demo account #${index} with credentials in ${manifestPath()}; run "npm run seed:demo -- --users --with-admin".`);
  }
  return new DemoAccount(role, found.email, found.password, found.practitionerRoleId);
}
