import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

/** A button on the toast («Отменить»): runs once, and the toast closes with it. */
export interface ToastAction {
  readonly label: string;
  readonly onAction: () => void;
}

export interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
  readonly action?: ToastAction;
}

export interface ToastInput {
  readonly tone: ToastTone;
  readonly message: string;
  readonly action?: ToastAction;
}

interface ToastState {
  readonly toasts: ReadonlyArray<Toast>;
  push: (input: ToastInput) => void;
  dismiss: (id: number) => void;
  clear: () => void;
}

/** More than this would bury the page; the oldest toast makes room for a new one. */
export const MAX_VISIBLE_TOASTS = 3;

let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (input) =>
    set((state) => {
      // A burst of failing queries (rate limit) must not stack identical toasts.
      if (state.toasts.some((toast) => toast.tone === input.tone && toast.message === input.message)) return state;
      const toast: Toast = { id: nextId++, ...input };
      return { toasts: [...state.toasts, toast].slice(-MAX_VISIBLE_TOASTS) };
    }),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  clear: () => set({ toasts: [] }),
}));
