import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('should answer ok with the service name when probed', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok', service: 'outbox-relay' });
  });
});
