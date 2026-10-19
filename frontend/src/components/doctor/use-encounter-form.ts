'use client';

import { useRef, useState } from 'react';
import { useForm, type FieldErrors, type FieldPath, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { UseMutationResult } from '@tanstack/react-query';
import { isApiError } from '@/lib/api/api-fetch';
import { applyProblemToForm, groupFieldErrors, isValidationProblem } from '@/lib/api/field-errors';
import type { ProblemDetails } from '@/lib/api/problem';
import { completeEncounterSchema, type CompleteEncounterForm } from '@/lib/contracts';
import { translate } from '@/lib/i18n/translate';
import { EMPTY_DIAGNOSIS } from './encounter-form-defaults';
import type { EncounterSummary } from './doctor-types';
import { firstErrorPath, firstPathOnScreen } from './encounter-error-focus';
import { knownFieldPaths, mapProblemToFieldAssignments } from './encounter-problem-fields';
import { encounterErrorMap } from './encounter-zod-messages';
import { useCompleteEncounter } from './use-doctor-mutations';

const DEFAULT_VALUES: CompleteEncounterForm = {
  summary: '',
  diagnoses: [EMPTY_DIAGNOSIS],
  recommendations: '',
  observations: [],
  serviceRequests: [],
  medicationRequests: [],
};

type Methods = UseFormReturn<CompleteEncounterForm>;

interface ServerMarks {
  /** At least one field of the form was marked from the server's answer. */
  readonly isMarked: boolean;
  /** What the server said about fields this form does not have; shown in the banner because it would otherwise be lost. */
  readonly foreignMessages: ReadonlyArray<string>;
}

/** The server's field paths that this form shows (the rest end up in the banner), in the order the server listed them. */
function namedFields(problem: ProblemDetails, values: CompleteEncounterForm): ReadonlyArray<string> {
  const known: ReadonlyArray<string> = knownFieldPaths(values);
  return Object.keys(groupFieldErrors(problem.details)).filter((field) => known.includes(field));
}

/**
 * Puts a failed completion on the form: the rejected codes get their message, other field errors land on their fields,
 * and focus goes to the first marked field on screen.
 */
function markServerProblem(methods: Methods, problem: ProblemDetails): ServerMarks {
  const values: CompleteEncounterForm = methods.getValues();
  const assignments = mapProblemToFieldAssignments(problem, values);
  assignments.forEach(({ path, messageKey }) => methods.setError(path as FieldPath<CompleteEncounterForm>, { type: 'server', message: translate(`doctor.${messageKey}`) }));
  const isFieldProblem: boolean = isValidationProblem(problem);
  const foreignMessages = isFieldProblem ? applyProblemToForm(problem, methods.setError, knownFieldPaths(values)) : [];
  const marked: ReadonlyArray<string> = [...assignments.map(({ path }) => path), ...(isFieldProblem ? namedFields(problem, values) : [])];
  const first: string | null = firstPathOnScreen(marked);
  if (first !== null) methods.setFocus(first as FieldPath<CompleteEncounterForm>);
  return { isMarked: assignments.length > 0, foreignMessages };
}

export interface EncounterFormController extends ServerMarks {
  readonly methods: Methods;
  readonly complete: UseMutationResult<EncounterSummary, Error, CompleteEncounterForm>;
  readonly onSubmit: ReturnType<Methods['handleSubmit']>;
}

interface Completion {
  readonly complete: UseMutationResult<EncounterSummary, Error, CompleteEncounterForm>;
  readonly marks: ServerMarks;
  readonly send: (values: CompleteEncounterForm) => void;
}

/**
 * The atomic POST and what comes of it. The button stays focusable while the request runs (`aria-disabled`, not `disabled`: a
 * disabled button drops keyboard focus), so a second press must not send the POST twice, not even one that lands before React
 * has rendered the pending state; a refusal from the server is put on the form.
 */
function useCompletion(encounterId: string, methods: Methods): Completion {
  const complete = useCompleteEncounter(encounterId);
  const [marks, setMarks] = useState<ServerMarks>({ isMarked: false, foreignMessages: [] });
  const isSending = useRef(false);
  const send = (values: CompleteEncounterForm): void => {
    if (isSending.current) return;
    isSending.current = true;
    setMarks({ isMarked: false, foreignMessages: [] });
    complete.mutate(values, {
      onError: (error) => (isApiError(error) ? setMarks(markServerProblem(methods, error.problem)) : undefined),
      onSettled: () => {
        isSending.current = false;
      },
    });
  };
  return { complete, marks, send };
}

/** State and submit of the completion form: zod rules mirroring the server's, one atomic POST, server answers shown on the fields. */
export function useEncounterForm(encounterId: string): EncounterFormController {
  // `shouldFocusError: false`: react-hook-form would focus the first *registered* field with an error, which is not the first one
  // on screen (a Controller registers after its row's plain inputs); `firstErrorPath` picks the right one.
  const methods = useForm<CompleteEncounterForm>({
    resolver: zodResolver(completeEncounterSchema, { errorMap: encounterErrorMap }),
    defaultValues: DEFAULT_VALUES,
    shouldFocusError: false,
  });
  const { complete, marks, send } = useCompletion(encounterId, methods);
  const handleInvalid = (errors: FieldErrors<CompleteEncounterForm>): void => {
    const path: string | null = firstErrorPath(errors);
    if (path !== null) methods.setFocus(path as FieldPath<CompleteEncounterForm>);
  };
  return { methods, complete, onSubmit: methods.handleSubmit(send, handleInvalid), ...marks };
}
