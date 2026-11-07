export interface ImportAcceptedDto {
  readonly importId: string;
  readonly snapshotVersion: string;
  readonly status: 'ACCEPTED';
  readonly acceptedAt: string;
}
