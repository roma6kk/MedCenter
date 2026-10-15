import {
  ACCOUNT_ATTEMPT_LIMIT,
  ACCOUNT_ATTEMPT_WINDOW_SECONDS,
  LoginThrottle,
  throttleKeyOf,
} from './login-throttle.service';
import { InMemoryLoginAttemptStore, type LoginAttemptStore } from './login-attempt-store';

function brokenStore(): jest.Mocked<LoginAttemptStore> {
  return {
    record: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    clear: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
  };
}

describe('throttleKeyOf', () => {
  it('should give one digest when the email differs only by case and surrounding spaces', () => {
    expect(throttleKeyOf('  Ivanov@Example.by ')).toBe(throttleKeyOf('ivanov@example.by'));
  });

  it('should not contain the email address when the key is built', () => {
    expect(throttleKeyOf('ivanov@example.by')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('LoginThrottle', () => {
  it('should admit the attempts up to the account limit', async () => {
    const throttle = new LoginThrottle(new InMemoryLoginAttemptStore());

    const answers: string[] = [];
    for (let attempt = 0; attempt < ACCOUNT_ATTEMPT_LIMIT; attempt += 1) {
      answers.push(await throttle.admit('ivanov@example.by'));
    }

    expect(new Set(answers)).toEqual(new Set(['admitted']));
  });

  it('should refuse the attempt that exceeds the account limit', async () => {
    const throttle = new LoginThrottle(new InMemoryLoginAttemptStore());
    for (let attempt = 0; attempt < ACCOUNT_ATTEMPT_LIMIT; attempt += 1) {
      await throttle.admit('ivanov@example.by');
    }

    await expect(throttle.admit('ivanov@example.by')).resolves.toBe('throttled');
  });

  it('should share one budget when the same account is typed in another case', async () => {
    const throttle = new LoginThrottle(new InMemoryLoginAttemptStore());
    for (let attempt = 0; attempt < ACCOUNT_ATTEMPT_LIMIT; attempt += 1) {
      await throttle.admit('ivanov@example.by');
    }

    await expect(throttle.admit('IVANOV@Example.by')).resolves.toBe('throttled');
  });

  it('should keep the budget of another account intact when one account is throttled', async () => {
    const throttle = new LoginThrottle(new InMemoryLoginAttemptStore());
    for (let attempt = 0; attempt <= ACCOUNT_ATTEMPT_LIMIT; attempt += 1) {
      await throttle.admit('ivanov@example.by');
    }

    await expect(throttle.admit('petrov@example.by')).resolves.toBe('admitted');
  });

  it('should count attempts for an email that has no account so that the answer never tells which exist', async () => {
    const store = new InMemoryLoginAttemptStore();
    const record = jest.spyOn(store, 'record');

    await new LoginThrottle(store).admit('nobody@example.by');

    expect(record).toHaveBeenCalledWith(throttleKeyOf('nobody@example.by'), ACCOUNT_ATTEMPT_WINDOW_SECONDS);
  });

  it('should restore the full budget when a valid login forgives the account', async () => {
    const throttle = new LoginThrottle(new InMemoryLoginAttemptStore());
    for (let attempt = 0; attempt <= ACCOUNT_ATTEMPT_LIMIT; attempt += 1) {
      await throttle.admit('ivanov@example.by');
    }

    await throttle.forgive('ivanov@example.by');

    await expect(throttle.admit('ivanov@example.by')).resolves.toBe('admitted');
  });

  it('should answer unavailable instead of admitting when the counter cannot be reached', async () => {
    const throttle = new LoginThrottle(brokenStore());

    await expect(throttle.admit('ivanov@example.by')).resolves.toBe('unavailable');
  });

  it('should not throw when clearing the counter fails after a valid login', async () => {
    const throttle = new LoginThrottle(brokenStore());

    await expect(throttle.forgive('ivanov@example.by')).resolves.toBeUndefined();
  });
});
