import { detailCodeOf, problemOf } from './problem-of';
import { apiProblem } from './test-utils';

describe('problemOf', () => {
  it('should return the problem when the error is an ApiError', () => {
    const error = apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'EMAIL_TAKEN: taken' });

    expect(problemOf(error)?.errorCode).toBe('CONFLICT');
  });

  it('should return null when the error did not come from the API', () => {
    expect(problemOf(new Error('boom'))).toBeNull();
    expect(problemOf(undefined)).toBeNull();
  });
});

describe('detailCodeOf', () => {
  it.each(['EMAIL_TAKEN', 'PRACTITIONER_ROLE_TAKEN', 'SELF_LOCKOUT', 'IMPORT_RUNNING', 'SNAPSHOT_NOT_BUNDLED', 'ROOM_IN_USE', 'SCHEDULE_OVERLAP'])(
    'should read the code %s when the detail starts with it',
    (code) => {
      const problem = problemOf(apiProblem({ status: 409, errorCode: 'CONFLICT', detail: `${code}: some english text` }));

      expect(detailCodeOf(problem)).toBe(code);
    },
  );

  it('should accept a detail when it is the bare code', () => {
    expect(detailCodeOf(problemOf(apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'SELF_LOCKOUT' })))).toBe('SELF_LOCKOUT');
  });

  it('should return null when the detail has no known code or is missing', () => {
    expect(detailCodeOf(problemOf(apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'Something else' })))).toBeNull();
    expect(detailCodeOf(problemOf(apiProblem({ status: 500, errorCode: 'INTERNAL' })))).toBeNull();
    expect(detailCodeOf(null)).toBeNull();
  });
});
