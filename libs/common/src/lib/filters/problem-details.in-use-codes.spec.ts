import type { ArgumentsHost } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ERROR_CODE_HTTP_STATUS, ERROR_CODES, type ErrorCode } from '@medcenter/contracts';

import { type MockHttpResponse } from '../../__tests__/mock-context';
import { ProblemDetailsFilter } from './problem-details.filter';

interface SentProblem {
  readonly status: number;
  readonly errorCode: ErrorCode;
  readonly type: string;
  readonly detail: string;
  readonly instance: string;
  readonly requestId: string;
}

function createResponse(): MockHttpResponse {
  return {
    header: jest.fn(),
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
}

function handle(exception: unknown): { readonly problem: SentProblem; readonly response: MockHttpResponse } {
  const response = createResponse();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/api/v1/admin/resource/42', requestId: 'req-in-use' }),
      getResponse: () => response,
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(exception, host);
  return { problem: response.send.mock.calls[0]?.[0] as SentProblem, response };
}

describe('ProblemDetailsFilter error-code catalogue', () => {
  describe('referenced-resource conflicts (admin deletes)', () => {
    it.each([
      ['ROOM_IN_USE', 'ROOM_IN_USE: room room-204 is referenced by a schedule'],
      ['SERVICE_IN_USE', 'SERVICE_IN_USE: service svc-1 is referenced by a schedule'],
      ['SCHEDULE_IN_USE', 'SCHEDULE_IN_USE: schedule sch-1 has busy slots'],
    ] as const)('should answer 409 %s when a ConflictException carries that catalogued code', (code, message) => {
      // Arrange
      const exception = new ConflictException({ errorCode: code, message });

      // Act
      const { problem, response } = handle(exception);

      // Assert
      expect(response.status).toHaveBeenCalledWith(409);
      expect(response.type).toHaveBeenCalledWith('application/problem+json');
      expect(problem).toMatchObject({
        status: 409,
        errorCode: code,
        detail: message,
        instance: '/api/v1/admin/resource/42',
        requestId: 'req-in-use',
      });
    });

    it.each(['ROOM_IN_USE', 'SERVICE_IN_USE', 'SCHEDULE_IN_USE'] as const)(
      'should build the problem type URL from the %s slug when the code is promoted',
      (code) => {
        // Arrange
        const exception = new ConflictException({ errorCode: code, message: code });

        // Act
        const { problem } = handle(exception);

        // Assert
        expect(problem.type).toBe(`https://api.medcenter.by/errors/${code.toLowerCase().replace(/_/g, '-')}`);
      },
    );
  });

  describe('code promotion', () => {
    it('should degrade to CONFLICT when a 409 carries a code the catalogue does not list', () => {
      // Arrange — the failure the catalogue entries fix: an uncatalogued code never reaches the client.
      const exception = new ConflictException({ errorCode: 'ROOM_BUSY_TODAY', message: 'ROOM_BUSY_TODAY: nope' });

      // Act
      const { problem } = handle(exception);

      // Assert
      expect(problem.errorCode).toBe('CONFLICT');
      expect(problem.detail).toBe('ROOM_BUSY_TODAY: nope');
    });

    it('should degrade to the status code when the errorCode is not a string', () => {
      // Arrange
      const exception = new ConflictException({ errorCode: 409, message: 'bad shape' });

      // Act
      const { problem } = handle(exception);

      // Assert
      expect(problem.errorCode).toBe('CONFLICT');
    });

    it('should answer plain CONFLICT and never an in-use code when a 409 carries no errorCode', () => {
      // Arrange — guards the declaration order of ERROR_CODE_HTTP_STATUS: the first 409 entry is the generic one.
      const exception = new ConflictException('version conflict');

      // Act
      const { problem } = handle(exception);

      // Assert
      expect(problem.errorCode).toBe('CONFLICT');
    });

    it.each([
      [new BadRequestException('bad'), 'VALIDATION_ERROR'],
      [new UnauthorizedException('no token'), 'UNAUTHENTICATED'],
      [new NotFoundException('gone'), 'NOT_FOUND'],
      [new HttpException('slow down', 429), 'RATE_LIMITED'],
      [new HttpException('upstream', 502), 'INTERNAL'],
    ] as const)('should derive the generic code from the status when %s carries no errorCode', (exception, expected) => {
      // Act
      const { problem } = handle(exception);

      // Assert
      expect(problem.errorCode).toBe(expected);
    });

    it.each(ERROR_CODES)('should keep the catalogued code and its status in step when %s is thrown explicitly', (code) => {
      // Arrange
      const status = ERROR_CODE_HTTP_STATUS[code];
      const exception = new HttpException({ errorCode: code, message: `${code} detail` }, status);

      // Act
      const { problem, response } = handle(exception);

      // Assert
      expect(response.status).toHaveBeenCalledWith(status);
      expect(problem).toMatchObject({ status, errorCode: code });
    });
  });
});
