/** One seeded `ValueSet` of `GET /api/v1/terminology/value-sets` (api-designer-spec §2.3.1). */
export interface ValueSetSummary {
  readonly url: string;
  readonly name: string;
  readonly title?: string;
  readonly version?: string;
  readonly status?: string;
}

/** `202 Accepted` of `POST /api/v1/admin/terminology/import` (§2.3.4): the import runs in the background. */
export interface ImportAccepted {
  readonly importId: string;
  readonly snapshotVersion: string;
  readonly status: 'ACCEPTED';
  readonly acceptedAt: string;
}
