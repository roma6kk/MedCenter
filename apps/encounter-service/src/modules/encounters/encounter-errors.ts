import { ConflictException, InternalServerErrorException } from '@nestjs/common';

export function stateInvalid(message: string): ConflictException {
  return new ConflictException({ errorCode: 'ENCOUNTER_STATE_INVALID', message: `ENCOUNTER_STATE_INVALID: ${message}` });
}

export function internal(message: string): InternalServerErrorException {
  return new InternalServerErrorException({ errorCode: 'INTERNAL', message: `INTERNAL: ${message}` });
}
