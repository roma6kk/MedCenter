import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { AuditQueryDto, toActionList } from './audit-query.dto';

function parse(query: Record<string, unknown>): { readonly dto: AuditQueryDto; readonly valid: boolean } {
  const dto = plainToInstance(AuditQueryDto, query);
  return { dto, valid: validateSync(dto, { whitelist: true }).length === 0 };
}

describe('toActionList', () => {
  it.each([
    ['a single value', 'login', ['login']],
    ['a comma list', 'login, logout', ['login', 'logout']],
    ['repeated parameters', ['login', 'logout,login'], ['login', 'logout']],
    ['an empty string', '', undefined],
  ])('should normalise %s into a distinct list', (_case, value, expected) => {
    expect(toActionList({ value })).toEqual(expected);
  });
});

describe('AuditQueryDto action', () => {
  it('should accept every known action', () => {
    expect(parse({ action: 'login,login-failed,login-throttled,logout,session-idle,read,denied,emergency-bypass,create,update,delete' }).valid).toBe(true);
  });

  it('should be optional', () => {
    expect(parse({}).valid).toBe(true);
  });

  it.each(['teleport', 'login,teleport', 'LOGIN'])('should refuse %s', (action) => {
    expect(parse({ action }).valid).toBe(false);
  });
});
