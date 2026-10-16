import { assertAdminGrant } from './demo-admin-grant';

describe('assertAdminGrant', () => {
  it('should accept a grant that carries user/*.write', () => {
    expect(() => assertAdminGrant('medcenter-web', 'launch user/*.read user/*.write')).not.toThrow();
  });

  it('should name the client and the missing scope when the grant was narrowed to launch', () => {
    expect(() => assertAdminGrant('medcenter-web', 'launch')).toThrow(/user\/\*\.write.*"medcenter-web"/s);
  });

  it('should not judge a token response that reports no scope', () => {
    expect(() => assertAdminGrant('medcenter-web', undefined)).not.toThrow();
  });
});
