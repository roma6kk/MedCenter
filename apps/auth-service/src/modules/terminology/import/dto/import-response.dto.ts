/** `202 Accepted` of `POST /api/v1/admin/terminology/import` (API 2.3.4): the import runs in the background. */
export interface ImportAcceptedDto {
  /** Correlates the log lines and the `AuditEvent`s of this import. */
  readonly importId: string;
  readonly snapshotVersion: string;
  readonly status: 'ACCEPTED';
  readonly acceptedAt: string;
}
