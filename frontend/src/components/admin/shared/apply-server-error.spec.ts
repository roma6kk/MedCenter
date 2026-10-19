import { applyServerError, type ServerFieldRule } from './apply-server-error';
import { apiProblem } from './test-utils';

const rules: Readonly<Record<string, ServerFieldRule>> = { EMAIL_TAKEN: { field: 'email', message: 'Email занят' } };

function form(): { setError: jest.Mock; setFocus: jest.Mock } {
  return { setError: jest.fn(), setFocus: jest.fn() };
}

describe('applyServerError', () => {
  it('should put every details entry on its field and focus the first one when the server names fields', () => {
    const target = form();
    const error = apiProblem({
      status: 400,
      errorCode: 'VALIDATION_ERROR',
      details: [
        { field: 'lastName', message: 'lastName should not be empty' },
        { field: 'email', message: 'email must be an email' },
      ],
    });

    applyServerError(error, target, ['email', 'lastName'], rules);

    expect(target.setError).toHaveBeenCalledWith('lastName', { type: 'server', message: 'Поле обязательно для заполнения' });
    expect(target.setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Введите корректный email' });
    expect(target.setFocus).toHaveBeenCalledWith('lastName');
  });

  it('should map a detail code to its field with the localized message and focus it when the server answers 409', () => {
    const target = form();
    const error = apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'EMAIL_TAKEN: a user with this email already exists' });

    applyServerError(error, target, ['email'], rules);

    expect(target.setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Email занят' });
    expect(target.setFocus).toHaveBeenCalledWith('email');
  });

  it('should leave the form alone when the server reason belongs to no field', () => {
    const target = form();

    applyServerError(apiProblem({ status: 500, errorCode: 'INTERNAL' }), target, ['email'], rules);

    expect(target.setError).not.toHaveBeenCalled();
    expect(target.setFocus).not.toHaveBeenCalled();
  });

  it('should ignore an error when it did not come from the API', () => {
    const target = form();

    applyServerError(new Error('network'), target, ['email'], rules);

    expect(target.setError).not.toHaveBeenCalled();
  });
});

describe('applyServerError outcome', () => {
  it('should say the failure is on the fields when a detail code took its field', () => {
    const error = apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'EMAIL_TAKEN: a user with this email already exists' });

    expect(applyServerError(error, form(), ['email'], rules)).toEqual({ onFields: true, leftover: [] });
  });

  it('should say the banner is still needed when the reason belongs to no field', () => {
    expect(applyServerError(apiProblem({ status: 500, errorCode: 'INTERNAL' }), form(), ['email'], rules)).toEqual({ onFields: false, leftover: [] });
    expect(applyServerError(new Error('network'), form(), ['email'], rules)).toEqual({ onFields: false, leftover: [] });
  });

  it('should hand back the messages of fields the form does not have when details name an unknown field', () => {
    const error = apiProblem({
      status: 400,
      errorCode: 'VALIDATION_ERROR',
      details: [
        { field: 'email', message: 'email must be an email' },
        { field: 'windows.0.startTime', message: 'startTime must be a valid time' },
      ],
    });

    const outcome = applyServerError(error, form(), ['email'], rules);

    expect(outcome.onFields).toBe(false);
    expect(outcome.leftover).toEqual(['startTime must be a valid time']);
  });
});
