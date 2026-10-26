/**
 * toast — raises a localized toast from code that runs outside React (API error effects, session handling).
 * Components render the toasts through `<Toaster />` (mounted by `Providers`).
 */
import { translate, type TranslateValues } from '@/lib/i18n/translate';
import { useToastStore, type ToastTone } from '@/store/use-toast-store';

/** The button of a toast: its label is a message key too, `onAction` is what «Отменить» does. */
export interface ToastActionSpec {
  readonly labelKey: string;
  readonly onAction: () => void;
}

export function showToast(tone: ToastTone, messageKey: string, values?: TranslateValues, action?: ToastActionSpec): void {
  useToastStore.getState().push({
    tone,
    message: translate(messageKey, values),
    ...(action === undefined ? {} : { action: { label: translate(action.labelKey), onAction: action.onAction } }),
  });
}
