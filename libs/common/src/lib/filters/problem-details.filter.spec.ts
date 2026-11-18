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
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
}

describe('ProblemDetailsFilter', () => {
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

  it('should carry the details[] of a validation failure into the problem body', () => {
    const filter = new ProblemDetailsFilter();
    const response = createResponse();
    const host = createHost(response, { originalUrl: '/api/v1/appointments', requestId: 'req-3' });
    const exception = new HttpException(
      {
        errorCode: 'VALIDATION_ERROR',
        message: 'slotId: must be a FHIR id',
        details: [{ field: 'slotId', message: 'must be a FHIR id' }, { field: 7 }, 'junk'],
      },
      400,
    );

    filter.catch(exception, host);

    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'VALIDATION_ERROR',
        detail: 'slotId: must be a FHIR id',
        details: [{ field: 'slotId', message: 'must be a FHIR id' }],
      }),
    );
  });

  it.each(['INVALID_ICD10_CODE', 'TERMINOLOGY_NOT_FOUND'])(
    'should carry the details[] of a 422 %s into the problem body next to its detail',
    (errorCode) => {
      const filter = new ProblemDetailsFilter();
      const response = createResponse();
      const host = createHost(response, { originalUrl: '/api/v1/encounters/e1/complete', requestId: 'req-6' });
      const exception = new HttpException(
        {
          errorCode,
          message: `${errorCode}: Z99`,
          details: [{ field: 'diagnoses.1.code', message: 'Z99 is not in ValueSet' }, { field: 7 }, 'junk'],
        },
        422,
      );

      filter.catch(exception, host);

      expect(response.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 422,
          errorCode,
          detail: `${errorCode}: Z99`,
          details: [{ field: 'diagnoses.1.code', message: 'Z99 is not in ValueSet' }],
        }),
      );
    },
  );

  it.each([
    ['an explicit non-validation errorCode', { errorCode: 'SLOT_CONFLICT', message: 'slot is not free' }, 409],
    ['no errorCode, derived from a 500 status', { message: 'boom' }, 500],
  ])('should drop details[] when the exception has %s', (_label, payload, status) => {
    const filter = new ProblemDetailsFilter();
    const response = createResponse();
    const host = createHost(response, { originalUrl: '/api/v1/x', requestId: 'req-5' });
    const exception = new HttpException({ ...payload, details: [{ field: 'internalColumn', message: 'secret state' }] }, status);

    filter.catch(exception, host);

    expect(response.send).toHaveBeenCalledWith(expect.not.objectContaining({ details: expect.anything() }));
  });

  it('should leave details out when the exception carries none', () => {
    const filter = new ProblemDetailsFilter();
    const response = createResponse();
    const host = createHost(response, { originalUrl: '/api/v1/x', requestId: 'req-4' });

    filter.catch(new NotFoundException('missing'), host);

    expect(response.send).toHaveBeenCalledWith(expect.not.objectContaining({ details: expect.anything() }));
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
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    );
    const sentBody = JSON.stringify(response.send.mock.calls[0]?.[0]);
    expect(sentBody).not.toContain('password=hunter2');
  });

  it('should title a problem by its error code, not by the exception class', () => {
    const filter = new ProblemDetailsFilter();
    const response = createResponse();
    const host = createHost(response, { originalUrl: '/api/v1/appointments', requestId: 'req-1' });

    filter.catch(new HttpException({ errorCode: 'SLOT_CONFLICT', message: 'taken' }, 409), host);

    expect(response.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'Slot conflict' }));
  });

  it('should answer a 401 with a WWW-Authenticate challenge', () => {
    const filter = new ProblemDetailsFilter();
    const anonymous = createResponse();
    const withToken = createResponse();

    filter.catch(
      new HttpException({ errorCode: 'UNAUTHENTICATED', message: 'no token' }, 401),
      createHost(anonymous, { originalUrl: '/a', requestId: 'r', headers: {} }),
    );
    filter.catch(
      new HttpException({ errorCode: 'UNAUTHENTICATED', message: 'bad token' }, 401),
      createHost(withToken, { originalUrl: '/a', requestId: 'r', headers: { authorization: 'Bearer x' } }),
    );

    expect(anonymous.header).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
    expect(withToken.header).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer error="invalid_token"');
  });

  it('should answer a body larger than the parser limit with 400 VALIDATION_ERROR', () => {
    const filter = new ProblemDetailsFilter();
    const response = createResponse();
    const host = createHost(response, { originalUrl: '/api/v1/echo', headers: {} });
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      expose: true,
      type: 'entity.too.large',
    });

    filter.catch(tooLarge, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'VALIDATION_ERROR', detail: 'Request body is too large' }),
    );
  });

  it('should give an error that precedes the request-id middleware a real id instead of unknown', () => {
    const filter = new ProblemDetailsFilter();
    const response = createResponse();
    const host = createHost(response, { originalUrl: '/api/v1/echo', headers: {} });

    filter.catch(new Error('boom'), host);

    const sent = (response.send as jest.Mock).mock.calls[0]?.[0] as { requestId: string };
    expect(sent.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', sent.requestId);
  });
});
