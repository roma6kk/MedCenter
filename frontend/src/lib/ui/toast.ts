/**
 * toast — raises a localized toast from code that runs outside React (API error effects, session handling).
 * Components render the toasts through `<Toaster />` (mounted by `Providers`).
 */
import { translate, type TranslateValues } from '@/lib/i18n/translate';
import { useToastStore, type ToastTone } from '@/store/use-toast-store';

export function showToast(tone: ToastTone, messageKey: string, values?: TranslateValues): void {
  useToastStore.getState().push({ tone, message: translate(messageKey, values) });
}
