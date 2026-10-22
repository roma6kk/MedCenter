import { act, renderHook } from '@testing-library/react';
import { useHiddenRecommendations } from './use-hidden-recommendations';

describe('useHiddenRecommendations', () => {
  beforeEach(() => window.localStorage.clear());

  it('should remember a hidden id per patient and restore them all', () => {
    const { result, unmount } = renderHook(() => useHiddenRecommendations('p1'));
    act(() => result.current.hide('ecg'));
    act(() => result.current.hide('ecg'));
    expect(result.current.hidden).toEqual(['ecg']);
    unmount();

    expect(renderHook(() => useHiddenRecommendations('p1')).result.current.hidden).toEqual(['ecg']);
    expect(renderHook(() => useHiddenRecommendations('p2')).result.current.hidden).toEqual([]);

    const again = renderHook(() => useHiddenRecommendations('p1'));
    act(() => again.result.current.restore());
    expect(again.result.current.hidden).toEqual([]);
    expect(window.localStorage.getItem('medcenter.profile.hiddenRecommendations.p1')).toBe('[]');
  });

  it('should ignore corrupt storage and survive a storage that throws', () => {
    window.localStorage.setItem('medcenter.profile.hiddenRecommendations.p1', '{oops');
    const { result } = renderHook(() => useHiddenRecommendations('p1'));
    expect(result.current.hidden).toEqual([]);
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    act(() => result.current.hide('phone'));
    expect(result.current.hidden).toEqual(['phone']);
    spy.mockRestore();
  });

  it('should keep the choice in memory only when the patient is unknown', () => {
    const { result } = renderHook(() => useHiddenRecommendations(undefined));
    act(() => result.current.hide('ecg'));
    expect(result.current.hidden).toEqual(['ecg']);
    expect(window.localStorage.length).toBe(0);
  });
});
