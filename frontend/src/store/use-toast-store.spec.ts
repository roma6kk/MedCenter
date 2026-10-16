import { MAX_VISIBLE_TOASTS, useToastStore } from './use-toast-store';

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.getState().clear();
  });

  it('should add a toast with a fresh id', () => {
    useToastStore.getState().push({ tone: 'info', message: 'a' });
    useToastStore.getState().push({ tone: 'info', message: 'b' });

    const ids = useToastStore.getState().toasts.map((toast) => toast.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('should not stack an identical toast that is still visible', () => {
    useToastStore.getState().push({ tone: 'error', message: 'Слишком много запросов' });
    useToastStore.getState().push({ tone: 'error', message: 'Слишком много запросов' });

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('should keep only the newest toasts when more than the limit arrive', () => {
    ['a', 'b', 'c', 'd'].forEach((message) => useToastStore.getState().push({ tone: 'info', message }));

    const messages = useToastStore.getState().toasts.map((toast) => toast.message);
    expect(messages).toEqual(['b', 'c', 'd']);
    expect(messages).toHaveLength(MAX_VISIBLE_TOASTS);
  });

  it('should remove a dismissed toast only', () => {
    useToastStore.getState().push({ tone: 'info', message: 'a' });
    useToastStore.getState().push({ tone: 'info', message: 'b' });
    const [first] = useToastStore.getState().toasts;

    useToastStore.getState().dismiss(first?.id ?? -1);

    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual(['b']);
  });
});
