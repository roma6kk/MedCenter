import '@testing-library/jest-dom';

// next/jest uses jsdom, which hides Node's WHATWG fetch globals.
// Install minimal shims so apiFetch specs can `jest.spyOn(global, 'fetch')`
// and construct `new Response(...)`. Tests replace fetch with mocks per case.
const nodeGlobals = globalThis as unknown as Record<string, unknown>;

class ResponseShim {
  readonly status: number;
  private readonly bodyText: string | null;

  constructor(body: string | null, init?: { status?: number }) {
    this.bodyText = body;
    this.status = init?.status ?? 200;
  }

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  async json(): Promise<unknown> {
    if (this.bodyText === null) return null;
    return JSON.parse(this.bodyText) as unknown;
  }
}

if (typeof nodeGlobals['Response'] === 'undefined') {
  nodeGlobals['Response'] = ResponseShim;
}
if (typeof nodeGlobals['fetch'] === 'undefined') {
  const notMocked = (): Promise<never> => Promise.reject(new Error('fetch not mocked'));
  nodeGlobals['fetch'] = notMocked;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeCrypto = require('node:crypto') as { webcrypto: Crypto; randomUUID: () => string };
Object.defineProperty(globalThis, 'crypto', { value: nodeCrypto.webcrypto, configurable: true, writable: true });
