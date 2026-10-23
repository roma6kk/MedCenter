import { useUiStore } from '@/store/use-ui-store';
import { applyProblemToForm, groupFieldErrors, hasDetailCode, isValidationProblem, localizeFieldMessage } from './field-errors';
import type { ProblemDetails } from './problem';

function validationProblem(details: ProblemDetails['details']): ProblemDetails {
  return { title: 'BadRequestException', status: 400, errorCode: 'VALIDATION_ERROR', details };
}

describe('groupFieldErrors', () => {
  it('should group several messages of one field under its name', () => {
    const grouped = groupFieldErrors([
      { field: 'lastName', message: 'lastName should not be empty' },
      { field: 'lastName', message: 'lastName must be a string' },
      { field: 'email', message: 'email must be an email' },
    ]);

    expect(grouped['lastName']).toEqual(['Поле обязательно для заполнения', 'Введите текстовое значение']);
    expect(grouped['email']).toEqual(['Введите корректный email']);
  });

  it('should normalise array paths to dotted RHF paths', () => {
    const grouped = groupFieldErrors([{ field: 'diagnoses[0].code', message: 'code must be a string' }]);

    expect(Object.keys(grouped)).toEqual(['diagnoses.0.code']);
  });

  it('should return an empty map when there are no details', () => {
    expect(groupFieldErrors(undefined)).toEqual({});
  });
});

describe('localizeFieldMessage', () => {
  it.each([
    ['password is not strong enough', /10 символов/],
    ['summary must be longer than or equal to 3 characters', /короткое/],
    ['summary must be shorter than or equal to 4000 characters', /длинное/],
    ['birthDate must be a valid ISO 8601 date string', /дату/],
  ])('should translate the class-validator message "%s"', (message, expected) => {
    expect(localizeFieldMessage(message)).toMatch(expected);
  });

  it('should show an unknown server message as the server wrote it', () => {
    expect(localizeFieldMessage('slot is outside the planning horizon')).toBe('slot is outside the planning horizon');
  });
});

describe('localizeFieldMessage in English', () => {
  beforeEach(() => useUiStore.setState({ locale: 'en' }));
  afterEach(() => useUiStore.setState({ locale: 'ru' }));

  it.each([
    ['email should not be empty', 'This field is required'],
    ['email must be an email', 'Enter a valid email'],
    ['summary must be longer than or equal to 3 characters', 'The value is too short'],
    ['summary must be shorter than or equal to 4000 characters', 'The value is too long'],
    ['birthDate must be a valid ISO 8601 date string', 'Enter a valid date'],
    ['gender must be one of the following values: male, female', 'Choose one of the allowed values'],
    ['code must match /^[A-Z]/ regular expression', 'The value has an invalid format'],
    ['phone must be a Belarus number: +375 and nine digits', 'Phone must be +375 and nine digits'],
  ])('should show "%s" in English when the interface is English', (message, expected) => {
    expect(localizeFieldMessage(message)).toBe(expected);
  });

  it('should explain the password rules in English when the server says the password is weak', () => {
    expect(localizeFieldMessage('password is not strong enough')).toMatch(/10\+ characters/);
  });

  it('should group the English texts under the field when the details are grouped', () => {
    const grouped = groupFieldErrors([{ field: 'email', message: 'email must be an email' }]);

    expect(grouped['email']).toEqual(['Enter a valid email']);
  });
});

describe('applyProblemToForm', () => {
  it('should set one server error per known field', () => {
    const setError = jest.fn();
    const problem = validationProblem([
      { field: 'email', message: 'email must be an email' },
      { field: 'password', message: 'password is not strong enough' },
    ]);

    const unmatched = applyProblemToForm(problem, setError, ['email', 'password', 'firstName']);

    expect(unmatched).toEqual([]);
    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Введите корректный email' });
    expect(setError).toHaveBeenCalledTimes(2);
  });

  it('should join several messages of the same field into one error', () => {
    const setError = jest.fn();

    applyProblemToForm(
      validationProblem([
        { field: 'lastName', message: 'lastName should not be empty' },
        { field: 'lastName', message: 'lastName must be a string' },
      ]),
      setError,
      ['lastName'],
    );

    expect(setError).toHaveBeenCalledWith('lastName', { type: 'server', message: 'Поле обязательно для заполнения. Введите текстовое значение' });
  });

  it('should hand back messages for fields that are not part of the form instead of dropping them', () => {
    const setError = jest.fn();

    const unmatched = applyProblemToForm(validationProblem([{ field: 'gender', message: 'gender is not supported' }]), setError, ['email']);

    expect(setError).not.toHaveBeenCalled();
    expect(unmatched).toEqual(['gender is not supported']);
  });
});

describe('isValidationProblem and hasDetailCode', () => {
  it('should be true only for a VALIDATION_ERROR that carries field details', () => {
    expect(isValidationProblem(validationProblem([{ field: 'a', message: 'b' }]))).toBe(true);
    expect(isValidationProblem(validationProblem(undefined))).toBe(false);
    expect(isValidationProblem({ title: 'x', status: 409, errorCode: 'CONFLICT', details: [{ field: 'a', message: 'b' }] })).toBe(false);
  });

  it('should find the EMAIL_TAKEN code the registration conflict hides inside detail', () => {
    const conflict: ProblemDetails = { title: 'Conflict', status: 409, errorCode: 'CONFLICT', detail: 'EMAIL_TAKEN: a user with this email already exists' };

    expect(hasDetailCode(conflict, 'EMAIL_TAKEN')).toBe(true);
    expect(hasDetailCode(conflict, 'OTHER')).toBe(false);
  });
});
