import type { Response } from 'express';
import type { ConsumerService } from '../notifications/consumer.service';
import { HealthController } from './health.controller';

function createResponse(): Response {
  return { status: jest.fn() } as unknown as Response;
}

function createController(listening: boolean): HealthController {
  return new HealthController({ isListening: () => listening } as unknown as ConsumerService);
}

describe('HealthController', () => {
  afterEach(() => {
    delete process.env['CONSUMER_ENABLED'];
  });

  it('should report the service as up when the consumer is listening', () => {
    const response = createResponse();

    expect(createController(true).check(response)).toEqual({ status: 'ok', service: 'notification-service' });
    expect(response.status).not.toHaveBeenCalled();
  });

  it('should answer 503 degraded when the consumer is enabled but disconnected', () => {
    const response = createResponse();

    expect(createController(false).check(response)).toEqual({
      status: 'degraded',
      service: 'notification-service',
      consumer: 'disconnected',
    });
    expect(response.status).toHaveBeenCalledWith(503);
  });

  it('should stay up without a consumer when CONSUMER_ENABLED=false', () => {
    process.env['CONSUMER_ENABLED'] = 'false';

    expect(createController(false).check(createResponse()).status).toBe('ok');
  });
});
