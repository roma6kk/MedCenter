import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

import { NoStoreInterceptor } from './no-store.interceptor';

describe('NoStoreInterceptor', () => {
  it('should set Cache-Control no-store before handing over to the handler', () => {
    const setHeader = jest.fn();
    const context = { switchToHttp: () => ({ getResponse: () => ({ setHeader }) }) } as unknown as ExecutionContext;
    const handle = jest.fn().mockReturnValue(of('body'));

    new NoStoreInterceptor().intercept(context, { handle } as CallHandler);

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader.mock.invocationCallOrder[0]).toBeLessThan(handle.mock.invocationCallOrder[0] ?? 0);
  });
});
