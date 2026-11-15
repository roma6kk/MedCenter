import { resolveIdleTimeoutMs, startIdleWatch } from './idle-watch';

const MINUTE = 60_000;

describe('resolveIdleTimeoutMs', () => {
  it('should default to 15 minutes when the value is missing or invalid', () => {
    expect(resolveIdleTimeoutMs(undefined)).toBe(15 * MINUTE);
    expect(resolveIdleTimeoutMs('')).toBe(15 * MINUTE);
    expect(resolveIdleTimeoutMs('0')).toBe(15 * MINUTE);
    expect(resolveIdleTimeoutMs('abc')).toBe(15 * MINUTE);
  });

  it('should read whole minutes', () => {
    expect(resolveIdleTimeoutMs('30')).toBe(30 * MINUTE);
  });
});

describe('startIdleWatch', () => {
  let onIdle: jest.Mock;
  let sendPing: jest.Mock;
  let stop: () => void;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-14T10:00:00Z') });
    window.localStorage.clear();
    onIdle = jest.fn();
    sendPing = jest.fn().mockResolvedValue(true);
    stop = startIdleWatch({ timeoutMs: 15 * MINUTE, onIdle, sendPing });
  });

  afterEach(() => {
    stop();
    jest.useRealTimers();
  });

  function touch(): void {
    window.dispatchEvent(new Event('keydown'));
  }

  it('should end the session after the limit without activity', () => {
    jest.advanceTimersByTime(14 * MINUTE);
    expect(onIdle).not.toHaveBeenCalled();

    jest.advanceTimersByTime(MINUTE + 15_000);

    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('should restart the countdown on activity', () => {
    jest.advanceTimersByTime(10 * MINUTE);
    touch();
    jest.advanceTimersByTime(10 * MINUTE);

    expect(onIdle).not.toHaveBeenCalled();
  });

  it('should count activity of another tab through the shared clock', () => {
    jest.advanceTimersByTime(10 * MINUTE);
    window.localStorage.setItem('mc-last-activity', String(Date.now()));
    jest.advanceTimersByTime(10 * MINUTE);

    expect(onIdle).not.toHaveBeenCalled();
  });

  it('should end the session on return to a tab that slept past the limit instead of counting it as activity', () => {
    jest.setSystemTime(Date.now() + 40 * MINUTE);

    touch();

    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(sendPing).not.toHaveBeenCalled();
  });

  it('should ping the server at most once a minute while the user is active', () => {
    touch();
    jest.advanceTimersByTime(20_000);
    touch();
    jest.advanceTimersByTime(45_000);
    touch();

    expect(sendPing).toHaveBeenCalledTimes(2);
  });

  it('should end the session when the server says it was already idle', async () => {
    stop();
    sendPing = jest.fn().mockResolvedValue(false);
    stop = startIdleWatch({ timeoutMs: 15 * MINUTE, onIdle, sendPing });

    touch();
    await Promise.resolve();
    await Promise.resolve();

    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  async function flush(): Promise<void> {
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  }

  it('should refresh the session once and ping again before ending it when the server answers not recorded', async () => {
    stop();
    sendPing = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const renewSession = jest.fn().mockResolvedValue(true);
    stop = startIdleWatch({ timeoutMs: 15 * MINUTE, onIdle, sendPing, renewSession });

    touch();
    await flush();

    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(sendPing).toHaveBeenCalledTimes(2);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('should end the session when the retried ping is still not recorded', async () => {
    stop();
    sendPing = jest.fn().mockResolvedValue(false);
    stop = startIdleWatch({ timeoutMs: 15 * MINUTE, onIdle, sendPing, renewSession: jest.fn().mockResolvedValue(true) });

    touch();
    await flush();

    expect(sendPing).toHaveBeenCalledTimes(2);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('should end the session without a second ping when the session cannot be renewed', async () => {
    stop();
    sendPing = jest.fn().mockResolvedValue(false);
    stop = startIdleWatch({ timeoutMs: 15 * MINUTE, onIdle, sendPing, renewSession: jest.fn().mockResolvedValue(false) });

    touch();
    await flush();

    expect(sendPing).toHaveBeenCalledTimes(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('should keep the session when the renewal fails because the token service is unavailable', async () => {
    stop();
    sendPing = jest.fn().mockResolvedValue(false);
    stop = startIdleWatch({ timeoutMs: 15 * MINUTE, onIdle, sendPing, renewSession: jest.fn().mockRejectedValue(new Error('unavailable')) });

    touch();
    await flush();

    expect(onIdle).not.toHaveBeenCalled();
  });

  it('should ignore a failed ping and not end the session', async () => {
    stop();
    sendPing = jest.fn().mockRejectedValue(new Error('offline'));
    stop = startIdleWatch({ timeoutMs: 15 * MINUTE, onIdle, sendPing });

    touch();
    await Promise.resolve();
    await Promise.resolve();

    expect(onIdle).not.toHaveBeenCalled();
  });

  it('should stop listening after cleanup', () => {
    stop();

    jest.advanceTimersByTime(60 * MINUTE);

    expect(onIdle).not.toHaveBeenCalled();
  });
});
