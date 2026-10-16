import { pollUntil } from './polling';

const FAST = { pollTimeoutMs: 200, pollIntervalMs: 5 };

describe('pollUntil', () => {
  it('should return the first value the probe yields', async () => {
    let calls = 0;

    const value = await pollUntil(FAST, 'a value', async () => {
      calls += 1;
      return calls < 3 ? undefined : 'ready';
    });

    expect([value, calls]).toEqual(['ready', 3]);
  });

  it('should fail with the label and the timeout when the probe never yields', async () => {
    await expect(pollUntil({ pollTimeoutMs: 30, pollIntervalMs: 5 }, 'the audit event', async () => undefined)).rejects.toThrow('the audit event did not show up within');
  });

  it('should let an error of the probe through at once instead of retrying it', async () => {
    const probe = jest.fn().mockRejectedValue(new Error('HTTP 500'));

    await expect(pollUntil(FAST, 'x', probe)).rejects.toThrow('HTTP 500');
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
