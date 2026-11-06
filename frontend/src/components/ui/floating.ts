import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const GAP_PX = 4;
const EDGE_PX = 8;

export interface FloatingPosition {
  readonly top: number;
  readonly left: number;
}

export type FloatingAlign = 'start' | 'end';

export function placeFloating(anchor: HTMLElement, size: { readonly width: number; readonly height: number }, align: FloatingAlign): FloatingPosition {
  const rect: DOMRect = anchor.getBoundingClientRect();
  const fitsBelow: boolean = rect.bottom + GAP_PX + size.height <= window.innerHeight || rect.top - GAP_PX - size.height < 0;
  const top: number = fitsBelow ? rect.bottom + GAP_PX : rect.top - GAP_PX - size.height;
  const preferred: number = align === 'end' ? rect.right - size.width : rect.left;
  const left: number = Math.min(Math.max(EDGE_PX, preferred), Math.max(EDGE_PX, window.innerWidth - size.width - EDGE_PX));
  return { top, left };
}

interface FloatingOptions {
  readonly anchor: HTMLElement | null;
  readonly panel: RefObject<HTMLElement>;
  readonly align: FloatingAlign;
  readonly width: number;
  readonly onOutsidePress: () => void;
}

// Scroll and resize move the panel with its anchor instead of closing it: a scroll queued by the opening gesture must not dismiss it.
export function useFloatingPosition({ anchor, panel, align, width, onOutsidePress }: FloatingOptions): FloatingPosition | null {
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const outsidePress = useRef(onOutsidePress);
  useLayoutEffect(() => {
    outsidePress.current = onOutsidePress;
  });
  useLayoutEffect(() => {
    const place = (): void => {
      if (anchor !== null && panel.current !== null) setPosition(placeFloating(anchor, { width, height: panel.current.offsetHeight }, align));
    };
    place();
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor?.contains(target)) outsidePress.current();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, panel, align, width]);
  return position;
}
