import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

import { SNAPSHOT_VERSION } from './snapshot-resources';

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
