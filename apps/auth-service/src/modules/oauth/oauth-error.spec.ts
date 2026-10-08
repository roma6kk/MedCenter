import { HttpStatus } from '@nestjs/common';

import { OAuthError } from './oauth-error';

describe('OAuthError', () => {
  describe('invalidRequest', () => {
    it('should return a 400 with invalid_request and a catalogue code', () => {
      const error = OAuthError.invalidRequest('redirect_uri was rejected');

      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({
        error: 'invalid_request',
        error_description: 'redirect_uri was rejected',
        errorCode: 'VALIDATION_ERROR',
      });
    });
  });

  describe('invalidClient', () => {
    it('should return a 401 with invalid_client and a catalogue code', () => {
      const error = OAuthError.invalidClient('Authenticated principal is required');

      expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(error.getResponse()).toMatchObject({
        error: 'invalid_client',
        error_description: 'Authenticated principal is required',
        errorCode: 'UNAUTHENTICATED',
      });
    });
  });

  describe('invalidGrant', () => {
    it('should return a 400 with invalid_grant and a catalogue code', () => {
      const error = OAuthError.invalidGrant('Refresh token is invalid or expired');

      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({
        error: 'invalid_grant',
        error_description: 'Refresh token is invalid or expired',
        errorCode: 'VALIDATION_ERROR',
      });
    });
  });

  describe('invalidGrantRevoked', () => {
    it('should return a 400 with invalid_grant', () => {
      const error = OAuthError.invalidGrantRevoked();

      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({
        error: 'invalid_grant',
        error_description: 'Refresh token has been revoked or already rotated',
        errorCode: 'VALIDATION_ERROR',
      });
    });
  });

  describe('invalidScope', () => {
    it('should return a 400 with invalid_scope and a catalogue code', () => {
      const error = OAuthError.invalidScope('None of the requested scopes is granted to this client');

      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({
        error: 'invalid_scope',
        error_description: 'None of the requested scopes is granted to this client',
        errorCode: 'VALIDATION_ERROR',
      });
    });
  });

  describe('unsupportedGrantType', () => {
    it('should return a 400 with unsupported_grant_type and a catalogue code', () => {
      const error = OAuthError.unsupportedGrantType('client_credentials');

      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({
        error: 'unsupported_grant_type',
        error_description: 'Unsupported grant_type: client_credentials',
        errorCode: 'VALIDATION_ERROR',
      });
    });
  });
});
