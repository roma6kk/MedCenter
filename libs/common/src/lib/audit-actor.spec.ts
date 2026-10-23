import { UnauthorizedException } from '@nestjs/common';

import { auditActorOf, type AuditedRequest } from './audit-actor';

describe('auditActorOf', () => {
  it('should take the token sub and the request id of the request', () => {
    const request = { user: { sub: 'user-1' }, requestId: 'req-1' } as unknown as AuditedRequest;

    expect(auditActorOf(request)).toEqual({ sub: 'user-1', requestId: 'req-1' });
  });

  it('should refuse a request without claims', () => {
    expect(() => auditActorOf({} as AuditedRequest)).toThrow(UnauthorizedException);
  });
});
