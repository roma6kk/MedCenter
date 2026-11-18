'use client';

import { useCallback, useEffect, useRef } from 'react';

// No-op while the request is in flight: it would cancel after the dialog was dismissed. Identity is stable (focus trap).
export function useCloseUnlessPending(pending: boolean, onClose: () => void): () => void {
  const isPending = useRef(pending);
  useEffect(() => {
    isPending.current = pending;
  }, [pending]);
  return useCallback(() => {
    if (!isPending.current) onClose();
  }, [onClose]);
}
