import { translate, type TranslateValues } from '@/lib/i18n/translate';
import { useToastStore, type ToastTone } from '@/store/use-toast-store';

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
