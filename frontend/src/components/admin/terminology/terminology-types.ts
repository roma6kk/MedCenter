export interface ValueSetSummary {
  readonly url: string;
  readonly name: string;
  readonly title?: string;
  readonly version?: string;
  readonly status?: string;
}

export interface ImportAccepted {
  readonly importId: string;
  readonly snapshotVersion: string;
  readonly status: 'ACCEPTED';
  readonly acceptedAt: string;
}
