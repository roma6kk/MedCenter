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

  it('should require the user/*.read scope and no role when the room list route is declared', () => {
    // Arrange
    const reflector = new Reflector();
    const handler = RoomsController.prototype.list;

    // Act
    const scopes = reflector.get<string[]>(REQUIRES_SCOPES_KEY, handler);
    const roles = reflector.get<Role[] | undefined>(REQUIRES_ROLES_KEY, handler);

    // Assert — API §4.3: any staff token with the read scope, not only an admin.
    expect(scopes).toEqual([SMART_SCOPES.USER_READ]);
    expect(roles).toBeUndefined();
  });

  it('should delegate the room list to RoomsService with the default page when the query is empty', async () => {
    // Arrange
    const page = { items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } };
    const rooms = { list: jest.fn().mockResolvedValue(page) };
    const listController = new RoomsController(rooms as unknown as RoomsService, roomUsage as unknown as RoomUsageService);

    // Act
    const response = await listController.list({});

    // Assert
    expect(rooms.list).toHaveBeenCalledWith(1, 20);
    expect(response).toBe(page);
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
