export type SmokeRole = 'ADMIN' | 'DOCTOR' | 'PATIENT';

export interface SmokeAccount {
  readonly role: SmokeRole;
  readonly email: string;
  readonly password: string;
  readonly practitionerRoleId?: string;
}

export interface TokenClaims {
  readonly sub?: string;
  readonly role?: string;
  readonly scope?: string;
  readonly fhirUser?: string;
  readonly patient?: string;
  readonly iss?: string;
  readonly exp?: number;
}

export interface Session {
  readonly email: string;
  readonly role: SmokeRole;
  readonly accessToken: string;
  readonly grantedScope: string;
  readonly claims: TokenClaims;
}

export type JsonObject = Readonly<Record<string, unknown>>;

export interface ApiResponse {
  readonly status: number;
  readonly contentType: string;
  readonly text: string;
  readonly body: unknown;
}

export interface SmokeConfig {
  readonly baseUrl: string;
  readonly manifestPath: string;
  readonly oauthClientId: string;
  readonly redirectUri: string;
  readonly pollTimeoutMs: number;
  readonly pollIntervalMs: number;
  readonly requestTimeoutMs: number;
  readonly consentEnforcement?: 'warn' | 'block';
}

export type Outcome = 'PASS' | 'FAIL' | 'SKIP';

export interface CheckResult {
  readonly group: string;
  readonly name: string;
  readonly outcome: Outcome;
  readonly millis: number;
  readonly detail?: string;
}
