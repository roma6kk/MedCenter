import { Reflector } from '@nestjs/core';
import { REQUIRES_ROLES_KEY, REQUIRES_SCOPES_KEY } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';

import type { RoomUsageService } from './room-usage.service';
import { RoomsController } from './rooms.controller';
import type { RoomsService } from './rooms.service';

describe('RoomsController', () => {
  const usageResponse = { roomId: 'room-204', inUse: false, truncated: false, items: [] };
  let roomUsage: jest.Mocked<Pick<RoomUsageService, 'usage'>>;
  let controller: RoomsController;

  beforeEach(() => {
    roomUsage = { usage: jest.fn().mockResolvedValue(usageResponse) };
    controller = new RoomsController({} as RoomsService, roomUsage as unknown as RoomUsageService);
  });

  it('should delegate the usage view to RoomUsageService with the path id when an admin asks', async () => {
    // Act
    const response = await controller.usage({ id: 'room-204' });

    // Assert
    expect(roomUsage.usage).toHaveBeenCalledWith('room-204');
    expect(response).toBe(usageResponse);
  });

  it('should require the ADMIN role and the user/*.read scope when the usage route is declared', () => {
    // Arrange
    const reflector = new Reflector();
    const handler = RoomsController.prototype.usage;

    // Act
    const roles = reflector.get<Role[]>(REQUIRES_ROLES_KEY, handler);
    const scopes = reflector.get<string[]>(REQUIRES_SCOPES_KEY, handler);

    // Assert
    expect(roles).toEqual([Role.ADMIN]);
    expect(scopes).toEqual([SMART_SCOPES.USER_READ]);
  });
});
