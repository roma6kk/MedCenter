/** Shared shapes of the live stack smoke suite (`npm run smoke:stack`). */

export type SmokeRole = 'ADMIN' | 'DOCTOR' | 'PATIENT';

/** A login read from the demo manifest. The password never leaves this object: nothing prints it. */
export interface SmokeAccount {
  readonly role: SmokeRole;
  readonly email: string;
  readonly password: string;
  /** `PractitionerRole.id` of a DOCTOR account. */
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

/** A signed-in user: the bearer token of the real PKCE flow and what the token says about itself. */
export interface Session {
  readonly email: string;
  readonly role: SmokeRole;
  readonly accessToken: string;
  /** The scope the server granted (may be narrower than the one requested). */
  readonly grantedScope: string;
  readonly claims: TokenClaims;
}

export type JsonObject = Readonly<Record<string, unknown>>;

export interface ApiResponse {
  readonly status: number;
  readonly contentType: string;
  readonly text: string;
  /** Parsed JSON, `undefined` when the body is empty or not JSON. */
  readonly body: unknown;
}

export interface SmokeConfig {
  /** The Traefik dev edge; every request of the suite goes through it. */
  readonly baseUrl: string;
  readonly manifestPath: string;
  readonly oauthClientId: string;
  readonly redirectUri: string;
  /** How long an eventually consistent read (RabbitMQ consumer, audit sync) may take to show up. */
  readonly pollTimeoutMs: number;
  readonly pollIntervalMs: number;
  /** How long one request may take, answer body included, before the check fails instead of hanging the suite. */
  readonly requestTimeoutMs: number;
  /** HAPI as the host publishes it: only the consent chain reads it (the bypass `AuditEvent` is not exposed by any API). */
  readonly fhirBaseUrl: string;
  /** What the stack's `CONSENT_ENFORCEMENT` is, when known; unset means the consent chain detects it. */
  readonly consentEnforcement?: 'warn' | 'block';
}

export type Outcome = 'PASS' | 'FAIL' | 'SKIP';

export interface CheckResult {
  readonly group: string;
  readonly name: string;
  readonly outcome: Outcome;
  readonly millis: number;
  /** Why a check failed or was skipped; never contains a credential. */
  readonly detail?: string;
}
