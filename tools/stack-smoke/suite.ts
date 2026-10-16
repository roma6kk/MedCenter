import { randomUUID } from 'node:crypto';

import type { SmokeAccounts } from './smoke-accounts';
import type { ApiClient } from './smoke-http';
import type { SmokeRunner } from './smoke-runner';
import type { Session, SmokeConfig } from './smoke-types';

/** Everyone the suite acts as; each one went through the real PKCE login. */
export interface SmokeSessions {
  readonly admin: Session;
  readonly doctor: Session;
  readonly otherDoctor: Session;
  readonly patient: Session;
  readonly otherPatient: Session;
  readonly thirdPatient: Session;
}

export interface SlotRef {
  readonly id: string;
  readonly start: string;
}

/** The clinical chain's facts, filled in step by step and read by later groups (compartment, analytics). */
export interface ChainState {
  appointmentId?: string;
  encounterId?: string;
  slot?: SlotRef;
  patientId?: string;
  serviceId?: string;
  /** Admin report counters before the chain, to prove that the chain moved them. */
  baseline?: ReportBaseline;
}

export interface ReportBaseline {
  readonly appointments: number;
  readonly encounters: number;
  /** Bookings per service id. */
  readonly popularity: Readonly<Record<string, number>>;
}

export interface Suite {
  readonly runner: SmokeRunner;
  readonly api: ApiClient;
  readonly config: SmokeConfig;
  readonly accounts: SmokeAccounts;
  readonly sessions: SmokeSessions;
  readonly chain: ChainState;
}

/** `Idempotency-Key` values are UUIDs (API §0). */
export function newKey(): string {
  return randomUUID();
}

/** A unique, short suffix so repeated runs never collide on emails or identifiers. */
export function runTag(now: Date = new Date()): string {
  return `${now.getTime().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
