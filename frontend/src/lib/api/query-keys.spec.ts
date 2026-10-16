import { QueryClient } from '@tanstack/react-query';
import { queryKeys, queryRoots } from './query-keys';

describe('queryKeys', () => {
  it('should start every key with its domain (frontend-design-spec §5.1)', () => {
    expect(queryKeys.slots('d1', { from: '2026-10-16' })[0]).toBe('slots');
    expect(queryKeys.appointments()[0]).toBe('appointments');
    expect(queryKeys.doctorAppointments({ from: 'a' })[0]).toBe('doctorAppointments');
    expect(queryKeys.unreadCount[0]).toBe('notifications');
  });

  it('should put the identity before the params', () => {
    expect(queryKeys.slots('d1', { status: 'free' })).toEqual(['slots', 'd1', { status: 'free' }]);
    expect(queryKeys.history('p1')).toEqual(['patientHistory', 'p1', {}]);
  });

  it('should treat missing params and empty params as the same key', () => {
    expect(queryKeys.services()).toEqual(queryKeys.services({}));
  });

  it('should key the patient own history and a doctor view of a patient apart', () => {
    expect(queryKeys.history()).not.toEqual(queryKeys.history('p1'));
    expect(queryKeys.prescriptions()).toEqual(['prescriptions', 'me', {}]);
  });

  it('should keep the notification list and the unread counter under one root so one invalidation hits both', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.notifications(), { items: [] });
    client.setQueryData(queryKeys.unreadCount, 3);
    client.setQueryData(queryKeys.appointments(), { items: [] });

    void client.invalidateQueries({ queryKey: queryRoots.notifications });

    expect(client.getQueryState(queryKeys.notifications())?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.unreadCount)?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.appointments())?.isInvalidated).toBe(false);
  });

  it('should let one root invalidate every slot query whatever the doctor and range', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.slots('d1', { from: 'a' }), []);
    client.setQueryData(queryKeys.slots('d2', { from: 'b' }), []);

    void client.invalidateQueries({ queryKey: queryRoots.slots });

    expect(client.getQueryState(queryKeys.slots('d1', { from: 'a' }))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.slots('d2', { from: 'b' }))?.isInvalidated).toBe(true);
  });

  it('should keep the keys the existing components already use', () => {
    expect(queryKeys.roomUsage('r1')).toEqual(['roomUsage', 'r1']);
    expect(queryKeys.appointmentDetail('a1')).toEqual(['appointment', 'a1']);
    expect(queryKeys.doctorSchedule).toEqual(['doctorSchedule']);
    expect(queryKeys.unreadCount).toEqual(['notifications', 'unreadCount']);
  });
});
