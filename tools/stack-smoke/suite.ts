import { randomUUID } from 'node:crypto';

import type { SmokeAccounts } from './smoke-accounts';
import type { ApiClient } from './smoke-http';
import type { SmokeRunner } from './smoke-runner';
import type { Session, SmokeConfig } from './smoke-types';

export interface SmokeSessions {
  readonly admin: Session;
  readonly doctor: Session;
  readonly otherDoctor: Session;
  readonly patient: Session;
  readonly otherPatient: Session;
  readonly thirdPatient: Session;
}

interface SlotRef {
  readonly id: string;
  readonly start: string;
}

interface ChainState {
  appointmentId?: string;
  encounterId?: string;
  slot?: SlotRef;
  patientId?: string;
  serviceId?: string;
  baseline?: ReportBaseline;
}

export interface ReportBaseline {
  readonly appointments: number;
  readonly encounters: number;
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

export function newKey(): string {
  return randomUUID();
}

export function runTag(now: Date = new Date()): string {
  return `${now.getTime().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
