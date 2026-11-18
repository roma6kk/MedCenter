import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestScope {
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<RequestScope>();

export function runWithRequestId<T>(requestId: string, work: () => T): T {
  return storage.run({ requestId }, work);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
