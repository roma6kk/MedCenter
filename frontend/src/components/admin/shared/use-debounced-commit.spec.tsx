import { act, renderHook } from '@testing-library/react';
import { FILTER_DEBOUNCE_MS, useDebouncedCommit } from './use-debounced-commit';

describe('useDebouncedCommit', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('should commit the draft once typing has paused for the debounce time', () => {
    const commit = jest.fn();
    const { rerender } = renderHook(({ draft }) => useDebouncedCommit(draft, '', commit), { initialProps: { draft: '' } });

    rerender({ draft: 'э' });
    act(() => void jest.advanceTimersByTime(FILTER_DEBOUNCE_MS - 1));
    expect(commit).not.toHaveBeenCalled();
    act(() => void jest.advanceTimersByTime(1));

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('э');
  });

  it('should restart the wait on every keystroke so only the last draft is committed', () => {
    const commit = jest.fn();
    const { rerender } = renderHook(({ draft }) => useDebouncedCommit(draft, '', commit), { initialProps: { draft: '' } });

    rerender({ draft: 'э' });
    act(() => void jest.advanceTimersByTime(200));
    rerender({ draft: 'эк' });
    act(() => void jest.advanceTimersByTime(200));
    rerender({ draft: 'экг' });
    act(() => void jest.advanceTimersByTime(FILTER_DEBOUNCE_MS));

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('экг');
  });

  it('should commit nothing when the draft equals what is applied', () => {
    const commit = jest.fn();
    renderHook(() => useDebouncedCommit('экг', 'экг', commit));

    act(() => void jest.advanceTimersByTime(FILTER_DEBOUNCE_MS * 2));

    expect(commit).not.toHaveBeenCalled();
  });

  it('should drop the pending commit when the screen is left', () => {
    const commit = jest.fn();
    const { rerender, unmount } = renderHook(({ draft }) => useDebouncedCommit(draft, '', commit), { initialProps: { draft: '' } });
    rerender({ draft: 'э' });

    unmount();
    act(() => void jest.advanceTimersByTime(FILTER_DEBOUNCE_MS * 2));

    expect(commit).not.toHaveBeenCalled();
  });
});
