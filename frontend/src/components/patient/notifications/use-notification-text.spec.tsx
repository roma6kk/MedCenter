import { act, renderHook } from '@testing-library/react';
import { useUiStore } from '@/store/use-ui-store';
import { useNotificationText } from './use-notification-text';

const BOOKED = { kind: 'appointment.booked', start: '2026-11-10T07:00:00.000Z', text: 'Вы записаны на приём. Начало: 10 ноября, 10:00 (время Минска)' };

describe('useNotificationText', () => {
  beforeEach(() => act(() => useUiStore.setState({ locale: 'ru' })));

  it('should word a booked visit in the UI language with its start in clinic time', () => {
    const { result } = renderHook(() => useNotificationText());
    expect(result.current(BOOKED)).toMatch(/^Вы записаны на приём\. Начало: .*10:00.* \(время Минска\)$/);

    act(() => useUiStore.setState({ locale: 'en' }));
    expect(result.current(BOOKED)).toMatch(/^You are booked for a visit\. Starts: .*10:00.* \(Minsk time\)$/);
  });

  it('should word a cancellation by the clinic in English', () => {
    act(() => useUiStore.setState({ locale: 'en' }));
    const { result } = renderHook(() => useNotificationText());
    expect(result.current({ kind: 'appointment.cancelled.by-admin', text: 'Клиника отменила' })).toMatch(/^The clinic cancelled your appointment/);
  });

  it('should show the server text when the notification has no known kind or the booked one has no start', () => {
    act(() => useUiStore.setState({ locale: 'en' }));
    const { result } = renderHook(() => useNotificationText());
    expect(result.current({ text: 'Запись на приём отменена.' })).toBe('Запись на приём отменена.');
    expect(result.current({ kind: 'something.new', text: 'Новое' })).toBe('Новое');
    expect(result.current({ kind: 'appointment.booked', text: 'Вы записаны' })).toBe('Вы записаны');
  });
});
