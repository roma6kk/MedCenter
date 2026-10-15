import { UnauthorizedException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';

import { actorOf, type AuthenticatedRequest } from './request-actor';

const CLAIMS: JwtClaims = { sub: 'admin-1', scope: 'user/*.write', role: 'ADMIN', jti: 'jti-1' };

describe('actorOf', () => {
  it('should take the actor from the token subject and the correlation id from the request', () => {
    const request: AuthenticatedRequest = { user: CLAIMS, requestId: 'req-7' };

    expect(actorOf(request)).toEqual({ sub: 'admin-1', requestId: 'req-7' });
  });

  it('should leave the correlation id out when the request carries none', () => {
    expect(actorOf({ user: CLAIMS })).toEqual({ sub: 'admin-1' });
  });

  it('should ignore a patient claim and the other claims when the actor is built', () => {
    const request: AuthenticatedRequest = {
      user: { ...CLAIMS, patient: 'p-1', fhirUser: 'Patient/p-1' },
    };

    expect(actorOf(request)).toEqual({ sub: 'admin-1' });
  });

  it('should refuse with 401 UNAUTHENTICATED when the guard attached no claims', () => {
    expect(() => actorOf({})).toThrow(UnauthorizedException);
    expect(() => actorOf({})).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ errorCode: 'UNAUTHENTICATED' }),
      }),
    );
  });
});
