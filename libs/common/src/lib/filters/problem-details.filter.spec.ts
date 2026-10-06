import type { ArgumentsHost } from '@nestjs/common';
import { HttpException, NotFoundException } from '@nestjs/common';
import { type MockHttpResponse } from '../../__tests__/mock-context';
import { ProblemDetailsFilter } from './problem-details.filter';

function createHost(response: MockHttpResponse, request: Record<string, unknown>): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;
}

function createResponse(): MockHttpResponse {
  return {
    header: jest.fn(),
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
}

describe('ProblemDetailsFilter', () => {
  it('should map a validation error to 400 VALIDATION_ERROR', () => {
    const problem = ProblemDetailsFilter.fromValidationError('/api/v1/appointments', 'req-1', [
      { field: 'slotId', message: 'must be a UUID' },
    ]);

    expect(problem.status).toBe(400);
    expect(problem.errorCode).toBe('VALIDATION_ERROR');
  });

  it('should preserve an explicit errorCode carried by an HttpException payload', () => {
    const filter = new ProblemDetailsFilter();
    const response = createResponse();
    const host = createHost(response, { originalUrl: '/api/v1/users/1', requestId: 'req-9' });
    const exception = new HttpException(
      { errorCode: 'FORBIDDEN_ROLE', message: 'Role ADMIN is required' },
      403,
    );

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.type).toHaveBeenCalledWith('application/problem+json');
    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 403,
        errorCode: 'FORBIDDEN_ROLE',
        detail: 'Role ADMIN is required',
        requestId: 'req-9',
      }),
    );
  });

  it('should derive the errorCode from a plain NestJS exception status', () => {
    const filter = new ProblemDetailsFilter();
    const response = createResponse();
    const host = createHost(response, { originalUrl: '/api/v1/slots', requestId: 'req-2' });

    filter.catch(new NotFoundException('Slot not found'), host);

    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, errorCode: 'NOT_FOUND' }),
    );
  });

  it('should never echo internal details when an unhandled exception reaches the boundary', () => {
    const filter = new ProblemDetailsFilter();
    const response = createResponse();
    const host = createHost(response, { originalUrl: '/api/v1/encounters' });

    filter.catch(new Error('connection refused: password=hunter2'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        errorCode: 'INTERNAL',
        detail: 'Внутренняя ошибка сервера',
        requestId: 'unknown',
      }),
    );
    const sentBody = JSON.stringify(response.send.mock.calls[0]?.[0]);
    expect(sentBody).not.toContain('password=hunter2');
  });
});
