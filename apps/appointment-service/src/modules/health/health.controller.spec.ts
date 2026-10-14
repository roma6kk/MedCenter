import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('should report the service as up when the process is serving', () => {
    // Arrange
    const controller = new HealthController();

    // Act
    const health = controller.check();

    // Assert
    expect(health).toEqual({ status: 'ok', service: 'appointment-service' });
  });
});
