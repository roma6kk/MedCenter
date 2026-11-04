import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestScope {
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<RequestScope>();

/** Runs `work` with `requestId` bound to the async chain, so the logger can stamp it on every line (NFR-007). */
export function runWithRequestId<T>(requestId: string, work: () => T): T {
  return storage.run({ requestId }, work);
}

/** The correlation id of the request being served, `undefined` outside a request (boot, timers, consumers). */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
