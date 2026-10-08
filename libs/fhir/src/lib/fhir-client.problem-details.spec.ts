import type { ArgumentsHost } from '@nestjs/common';
import { ProblemDetailsFilter } from '@medcenter/common';
import { HttpClient } from './fhir-client.provider';

interface WireResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/**
 * Runs an error through the real boundary filter and returns what the client
 * would receive on the wire (status + problem+json body).
 */
function sendThroughFilter(error: unknown): WireResponse {
  const response = {
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/api/v1/schedules/1', requestId: 'req-7' }),
      getResponse: () => response,
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;

  new ProblemDetailsFilter().catch(error, host);

  return {
    status: response.status.mock.calls[0]?.[0] as number,
    body: response.send.mock.calls[0]?.[0] as Record<string, unknown>,
  };
}

/** Rejects a single HttpClient call and returns the raw error it threw. */
async function errorFrom(client: HttpClient): Promise<unknown> {
  try {
    await client.update('Schedule', '1', { resourceType: 'Schedule', id: '1' });
  } catch (error) {
    return error;
  }
  throw new Error('expected the request to reject');
}

function timeoutError(): Error {
  const timeout = new Error('The operation was aborted due to timeout');
  timeout.name = 'TimeoutError';
  return timeout;
}

describe('FhirClientError through ProblemDetailsFilter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockHapiError(status: number): void {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status,
      text: () => Promise.resolve('{"resourceType":"OperationOutcome","issue":[{"diagnostics":"hapi-internal"}]}'),
    }) as unknown as typeof fetch;
  }

  it.each([409, 412])('should send a HAPI %i write conflict to the client as 409 CONFLICT', async (upstream) => {
    mockHapiError(upstream);
    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });

    const wire = sendThroughFilter(await errorFrom(client));

    expect(wire.status).toBe(409);
    expect(wire.body).toMatchObject({ status: 409, errorCode: 'CONFLICT' });
    expect(JSON.stringify(wire.body)).not.toContain('hapi:8080');
    expect(JSON.stringify(wire.body)).not.toContain('hapi-internal');
  });

  it.each([400, 422])(
    'should send a HAPI %i rejection of our own write to the client as 500 INTERNAL, not 502',
    async (upstream) => {
      mockHapiError(upstream);
      const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });

      const wire = sendThroughFilter(await errorFrom(client));

      expect(wire.status).toBe(500);
      expect(wire.body).toMatchObject({
        status: 500,
        errorCode: 'INTERNAL',
        detail: 'Внутренняя ошибка сервера',
      });
      expect(JSON.stringify(wire.body)).not.toContain('hapi:8080');
      expect(JSON.stringify(wire.body)).not.toContain('hapi-internal');
    },
  );

  it('should send a stalled error body (headers arrived, body timed out) as 504 INTERNAL', async () => {
    // HAPI answered 503 but never finished the OperationOutcome: the timeout
    // must win over the upstream status, as it does for a stalled success body.
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.reject(timeoutError()),
    }) as unknown as typeof fetch;
    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });

    const error = (await errorFrom(client)) as { timedOut?: boolean };
    const wire = sendThroughFilter(error);

    expect(error.timedOut).toBe(true);
    expect(wire.status).toBe(504);
    expect(wire.body).toMatchObject({ status: 504, errorCode: 'INTERNAL' });
  });

  it('should keep a non-timeout error-body read failure as 502 (only timeouts become 504)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.reject(new Error('socket closed')),
    }) as unknown as typeof fetch;
    const client = new HttpClient({ baseUrl: 'http://hapi:8080/fhir' });

    const error = (await errorFrom(client)) as { timedOut?: boolean };
    const wire = sendThroughFilter(error);

    expect(error.timedOut).toBe(false);
    expect(wire.status).toBe(502);
    expect(wire.body).toMatchObject({ status: 502, errorCode: 'INTERNAL' });
  });
});
