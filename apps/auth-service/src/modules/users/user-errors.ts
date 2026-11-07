import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { DuplicateEmailError, ResourceAlreadyLinkedError } from './store/user-store';

export function emailTaken(): ConflictException {
  return new ConflictException({ errorCode: 'CONFLICT', message: 'EMAIL_TAKEN: a user with this email already exists' });
}

export function practitionerRoleTaken(): ConflictException {
  return new ConflictException({
    errorCode: 'CONFLICT',
    message: 'PRACTITIONER_ROLE_TAKEN: this PractitionerRole is already linked to another user',
  });
}

export function selfLockout(): ConflictException {
  return new ConflictException({
    errorCode: 'CONFLICT',
    message: 'SELF_LOCKOUT: an administrator cannot deactivate or demote their own account',
  });
}

export function userNotFound(): NotFoundException {
  return new NotFoundException({ errorCode: 'NOT_FOUND', message: 'User not found' });
}

export function invalidUserInput(message: string): BadRequestException {
  return new BadRequestException({ errorCode: 'VALIDATION_ERROR', message });
}

export function conflictOf(error: unknown): unknown {
  if (error instanceof DuplicateEmailError) {
    return emailTaken();
  }
  return error instanceof ResourceAlreadyLinkedError ? practitionerRoleTaken() : error;
}
