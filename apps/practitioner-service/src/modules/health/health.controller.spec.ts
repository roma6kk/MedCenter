import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('should report the service as up when the process is serving', () => {
    const controller = new HealthController();

    const health = controller.check();

    expect(health).toEqual({ status: 'ok', service: 'practitioner-service' });
  });
});
