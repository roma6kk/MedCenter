import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

import { SNAPSHOT_VERSION } from './snapshot-resources';

/**
 * Error factories of the snapshot import. `errorCode` values come from the
 * catalogue only (`libs/contracts` ERROR_CODES); the finer reason travels in
 * the RFC 7807 `detail`.
 */
export function importAlreadyRunning(): ConflictException {
  return new ConflictException({
    errorCode: 'CONFLICT',
    message: 'IMPORT_RUNNING: a terminology import is already running',
  });
}

export function snapshotNotBundled(requested: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    errorCode: 'TERMINOLOGY_NOT_FOUND',
    message: `SNAPSHOT_NOT_BUNDLED: snapshot ${requested} is not bundled with this service; available: ${SNAPSHOT_VERSION}`,
  });
}
