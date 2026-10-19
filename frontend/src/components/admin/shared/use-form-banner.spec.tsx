import { act, renderHook } from '@testing-library/react';
import { useFormBanner } from './use-form-banner';
import { apiProblem } from './test-utils';

function target(): { setError: jest.Mock; setFocus: jest.Mock } {
  return { setError: jest.fn(), setFocus: jest.fn() };
}

const rules = { EMAIL_TAKEN: { field: 'email', message: 'Email занят' } };

describe('useFormBanner', () => {
  it('should keep no banner when a field took the failure', () => {
    const { result } = renderHook(() => useFormBanner(target(), ['email'], rules));

    act(() => result.current.fail(apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'EMAIL_TAKEN: taken' })));

    expect(result.current.banner).toBeNull();
  });

  it('should keep the failure for the banner when no field takes it', () => {
    const error = apiProblem({ status: 500, errorCode: 'INTERNAL' });
    const { result } = renderHook(() => useFormBanner(target(), ['email'], rules));

    act(() => result.current.fail(error));

    expect(result.current.banner).toEqual({ error });
  });

  it('should carry the messages of unknown fields into the banner when a validation error names them', () => {
    const error = apiProblem({ status: 400, errorCode: 'VALIDATION_ERROR', details: [{ field: 'windows.0.startTime', message: 'startTime is wrong' }] });
    const { result } = renderHook(() => useFormBanner(target(), ['email'], rules));

    act(() => result.current.fail(error));

    expect(result.current.banner?.detail).toBe('startTime is wrong');
  });

  it('should drop the banner when a new submit starts', () => {
    const { result } = renderHook(() => useFormBanner(target(), ['email'], rules));
    act(() => result.current.fail(apiProblem({ status: 500, errorCode: 'INTERNAL' })));

    act(() => result.current.clear());

    expect(result.current.banner).toBeNull();
  });
});
