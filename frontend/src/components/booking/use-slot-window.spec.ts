import { act, renderHook } from '@testing-library/react';
import { MAX_LOOKAHEAD_DAYS, SLOT_WINDOW_DAYS, shiftDay, todayInClinic } from './slot-time';
import { useSlotWindow } from './use-slot-window';

describe('useSlotWindow', () => {
  const today: string = todayInClinic();

  it('should start today and span the default period when the hook is first used', () => {
    const { result } = renderHook(() => useSlotWindow());

    expect(result.current.window).toEqual({ from: today, to: shiftDay(today, SLOT_WINDOW_DAYS - 1) });
    expect(result.current.canGoBack).toBe(false);
  });

  it('should move a whole period forward and back again when the visitor pages through periods', () => {
    const { result } = renderHook(() => useSlotWindow());

    act(() => result.current.goForward());
    expect(result.current.window.from).toBe(shiftDay(today, SLOT_WINDOW_DAYS));
    expect(result.current.canGoBack).toBe(true);

    act(() => result.current.goBack());
    expect(result.current.window.from).toBe(today);
  });

  it('should not go back before today when the window starts today', () => {
    const { result } = renderHook(() => useSlotWindow(shiftDay(today, 3)));

    act(() => result.current.goBack());

    expect(result.current.window.from).toBe(today);
  });

  it('should start at the requested day when it lies ahead', () => {
    const target: string = shiftDay(today, 30);
    const { result } = renderHook(() => useSlotWindow(target));

    expect(result.current.window.from).toBe(target);
  });

  it('should jump to the day when it is typed and ignore it when it is garbage', () => {
    const { result } = renderHook(() => useSlotWindow());
    const target: string = shiftDay(today, 20);

    act(() => result.current.jumpTo(target));
    expect(result.current.window.from).toBe(target);

    act(() => result.current.jumpTo('not a day'));
    expect(result.current.window.from).toBe(target);
  });

  it('should clamp the jump to today when the typed day is in the past', () => {
    const { result } = renderHook(() => useSlotWindow(shiftDay(today, 20)));

    act(() => result.current.jumpTo(shiftDay(today, -5)));

    expect(result.current.window.from).toBe(today);
  });

  describe('upper limit', () => {
    const lastDay: string = shiftDay(today, MAX_LOOKAHEAD_DAYS);

    it('should stop at the last day the API accepts when the visitor keeps asking for later periods', () => {
      const { result } = renderHook(() => useSlotWindow());

      for (let press = 0; press < 40; press += 1) act(() => result.current.goForward());

      expect(result.current.window.from).toBe(lastDay);
      expect(result.current.canGoForward).toBe(false);
    });

    it('should never ask for a start further ahead than the API accepts when the visitor pages forward', () => {
      const { result } = renderHook(() => useSlotWindow());
      const starts: string[] = [];

      for (let press = 0; press < 40; press += 1) {
        act(() => result.current.goForward());
        starts.push(result.current.window.from);
      }

      expect(starts.every((from) => from <= lastDay)).toBe(true);
    });

    it('should allow later periods when the last day is not reached yet', () => {
      const { result } = renderHook(() => useSlotWindow());

      expect(result.current.canGoForward).toBe(true);
    });

    it('should still go back from the last period when the end is reached', () => {
      const { result } = renderHook(() => useSlotWindow(lastDay));

      act(() => result.current.goBack());

      expect(result.current.window.from).toBe(shiftDay(lastDay, -SLOT_WINDOW_DAYS));
      expect(result.current.canGoForward).toBe(true);
    });

    it('should clamp a typed date to the last day when it lies further ahead', () => {
      const { result } = renderHook(() => useSlotWindow());

      act(() => result.current.jumpTo(shiftDay(today, MAX_LOOKAHEAD_DAYS + 200)));

      expect(result.current.window.from).toBe(lastDay);
    });

    it('should start at the last day when a restored period lies beyond the look-ahead', () => {
      const { result } = renderHook(() => useSlotWindow(shiftDay(today, MAX_LOOKAHEAD_DAYS + 50)));

      expect(result.current.window.from).toBe(lastDay);
    });
  });
});
