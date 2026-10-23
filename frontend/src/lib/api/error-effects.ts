/**
 * error-effects — the side effects frontend-design-spec §5.4 attaches to an errorCode, independent of any screen.
 *
 * Applied once, centrally, by the QueryClient caches (`createAppQueryClient`): a toast for the codes that want one
 * and a refetch of the data that just turned out to be stale. Inline UX (field errors, banners, read-only forms)
 * stays with the component that owns the form.
 */
import type { QueryKey } from '@tanstack/react-query';
import { errorCodeToUx, errorMessageKey } from './error-code-map';
import type { ProblemDetails } from './problem';
import { queryRoots } from './query-keys';

export interface ToastEffect {
  readonly tone: 'info' | 'error';
  readonly messageKey: string;
  readonly values?: Readonly<Record<string, number>>;
}

export interface ErrorEffects {
  readonly toast: ToastEffect | null;
  readonly invalidate: ReadonlyArray<QueryKey>;
}

const NO_EFFECTS: ErrorEffects = { toast: null, invalidate: [] };

/** A failed query is retried by its owner; only a mutation (user action) refetches stale data and reports a lost connection. */
export type ErrorSource = 'query' | 'mutation';

function rateLimitToast(problem: ProblemDetails): ToastEffect {
  if (problem.retryAfter !== undefined && problem.retryAfter > 0) {
    return { tone: 'error', messageKey: 'errors.RATE_LIMITED_RETRY', values: { seconds: problem.retryAfter } };
  }
  return { tone: 'error', messageKey: errorMessageKey('RATE_LIMITED') };
}

function mutationEffects(problem: ProblemDetails): ErrorEffects {
  if (problem.status === 0) return { toast: { tone: 'error', messageKey: 'errors.NETWORK' }, invalidate: [] };
  const ux = errorCodeToUx(problem.errorCode);
  switch (ux.kind) {
    case 'slot-conflict':
      // BR-001: the slot is gone — refresh the list, tell the user, keep the wizard step.
      return { toast: { tone: 'info', messageKey: errorMessageKey('SLOT_CONFLICT') }, invalidate: [queryRoots.slots] };
    case 'appointment-refresh':
      return { toast: null, invalidate: [queryRoots.appointments, queryRoots.appointmentDetail] };
    case 'encounter-readonly':
      return { toast: null, invalidate: [queryRoots.encounters, queryRoots.doctorAppointments] };
    case 'consent-required':
    case 'consent-active':
      // The consent the screen showed is out of date: refresh it so the banner and the form agree with the server.
      return { toast: null, invalidate: [queryRoots.consent] };
    case 'rate-limit-toast':
      return { toast: rateLimitToast(problem), invalidate: [] };
    default:
      return NO_EFFECTS;
  }
}

export function effectsFor(problem: ProblemDetails, source: ErrorSource = 'mutation'): ErrorEffects {
  if (source === 'mutation') return mutationEffects(problem);
  // Invalidating from a failing query could loop (refetch → fail → invalidate), so a query only gets the rate-limit toast.
  return problem.errorCode === 'RATE_LIMITED' ? { toast: rateLimitToast(problem), invalidate: [] } : NO_EFFECTS;
}
