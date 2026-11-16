import { useEffect, useState } from 'react';
import { authorizeHref } from '@/lib/auth/authorize-href';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';

// The target is one of two fixed paths, never taken from storage. The draft is read after mount: sessionStorage does not exist on the server.
export function useSignInHref(returnTo: string = ''): string {
  const [target, setTarget] = useState(returnTo);
  useEffect(() => {
    const { doctorId, slotId } = useBookingDraftStore.getState();
    if (returnTo === '' && (doctorId !== null || slotId !== null)) setTarget('/booking');
  }, [returnTo]);
  return authorizeHref(target);
}
