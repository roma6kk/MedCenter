import { renderHook } from '@testing-library/react';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { useSignInHref } from './use-sign-in-href';

describe('useSignInHref', () => {
  beforeEach(() => {
    useBookingDraftStore.getState().clearDraft();
  });

  it('should open the cabinet home when the tab has no saved selection', () => {
    const { result } = renderHook(() => useSignInHref());

    expect(result.current).toBe('/api/auth/authorize');
  });

  it.each([['doctorId', 'doc-1'], ['slotId', 'slot-1']] as const)('should return to the booking wizard when %s is saved', (field, value) => {
    useBookingDraftStore.getState().updateDraft({ [field]: value });

    const { result } = renderHook(() => useSignInHref());

    expect(result.current).toBe('/api/auth/authorize?returnTo=%2Fbooking');
  });

  it('should keep an explicit returnTo over the saved selection', () => {
    useBookingDraftStore.getState().updateDraft({ doctorId: 'doc-1' });

    const { result } = renderHook(() => useSignInHref('/appointments'));

    expect(result.current).toBe('/api/auth/authorize?returnTo=%2Fappointments');
  });

  it('should ignore a draft that has only a service', () => {
    useBookingDraftStore.getState().updateDraft({ serviceId: 'svc-1' });

    const { result } = renderHook(() => useSignInHref());

    expect(result.current).toBe('/api/auth/authorize');
  });
});
