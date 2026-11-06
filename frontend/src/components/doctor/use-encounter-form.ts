'use client';

import { useRef, useState } from 'react';
import { useForm, type FieldErrors, type FieldPath, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { UseMutationResult } from '@tanstack/react-query';
import { isApiError } from '@/lib/api/api-fetch';
import { applyProblemToForm, groupFieldErrors, isValidationProblem } from '@/lib/api/field-errors';
import type { ProblemDetails } from '@/lib/api/problem';
import { completeEncounterSchema, type CompleteEncounterForm } from '@/lib/contracts';
import { readDraft } from '@/lib/encounter-draft';
import { translate } from '@/lib/i18n/translate';
import { EMPTY_DIAGNOSIS } from './encounter-form-defaults';
import type { EncounterSummary } from './doctor-types';
import { firstErrorPath, firstPathOnScreen } from './encounter-error-focus';
import { knownFieldPaths, mapProblemToFieldAssignments } from './encounter-problem-fields';
import { encounterErrorMap } from './encounter-zod-messages';
import { useCompleteEncounter } from './use-doctor-mutations';
import { useEncounterDraft, type EncounterDraftController } from './use-encounter-draft';
import type { CompleteEncounterBody } from './doctor-api';

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
  readonly isMarked: boolean;
  readonly foreignMessages: ReadonlyArray<string>;
}

function focusAfterRender(methods: Methods, path: string): void {
  setTimeout(() => methods.setFocus(path as FieldPath<CompleteEncounterForm>), 0);
}

function namedFields(problem: ProblemDetails, values: CompleteEncounterForm): ReadonlyArray<string> {
  const known: ReadonlyArray<string> = knownFieldPaths(values);
  return Object.keys(groupFieldErrors(problem.details)).filter((field) => known.includes(field));
}

function markServerProblem(methods: Methods, problem: ProblemDetails): ServerMarks {
  const values: CompleteEncounterForm = methods.getValues();
  const assignments = mapProblemToFieldAssignments(problem, values);
  assignments.forEach(({ path, messageKey }) => methods.setError(path as FieldPath<CompleteEncounterForm>, { type: 'server', message: translate(`doctor.${messageKey}`) }));
  const isFieldProblem: boolean = isValidationProblem(problem);
  const foreignMessages = isFieldProblem ? applyProblemToForm(problem, methods.setError, knownFieldPaths(values)) : [];
  const marked: ReadonlyArray<string> = [...assignments.map(({ path }) => path), ...(isFieldProblem ? namedFields(problem, values) : [])];
  const first: string | null = firstPathOnScreen(marked);
  if (first !== null) focusAfterRender(methods, first);
  return { isMarked: assignments.length > 0, foreignMessages };
}

interface EncounterFormController extends ServerMarks {
  readonly methods: Methods;
  readonly complete: UseMutationResult<EncounterSummary, Error, CompleteEncounterBody>;
  readonly onSubmit: ReturnType<Methods['handleSubmit']>;
  readonly completeAsEmergency: (reason: string) => void;
  readonly draft: EncounterDraftController;
  readonly startOver: () => void;
}

interface Completion {
  readonly complete: UseMutationResult<EncounterSummary, Error, CompleteEncounterBody>;
  readonly marks: ServerMarks;
  readonly send: (values: CompleteEncounterForm, emergencyReason?: string) => void;
}

function useCompletion(encounterId: string, methods: Methods, onCompleted: () => void): Completion {
  const complete = useCompleteEncounter(encounterId, onCompleted);
  const [marks, setMarks] = useState<ServerMarks>({ isMarked: false, foreignMessages: [] });
  const isSending = useRef(false);
  const send = (values: CompleteEncounterForm, emergencyReason?: string): void => {
    if (isSending.current) return;
    isSending.current = true;
    setMarks({ isMarked: false, foreignMessages: [] });
    complete.mutate(emergencyReason === undefined ? values : { ...values, emergencyReason }, {
      onError: (error) => (isApiError(error) ? setMarks(markServerProblem(methods, error.problem)) : undefined),
      onSettled: () => {
        isSending.current = false;
      },
    });
  };
  return { complete, marks, send };
}

export function useEncounterForm(encounterId: string): EncounterFormController {
  // shouldFocusError: false: RHF would focus the first registered field, not the first on screen (a Controller registers late); firstErrorPath decides.
  const [restored] = useState(() => readDraft(encounterId));
  const methods = useForm<CompleteEncounterForm>({
    resolver: zodResolver(completeEncounterSchema, { errorMap: encounterErrorMap }),
    defaultValues: restored?.values ?? DEFAULT_VALUES,
    shouldFocusError: false,
  });
  const draft = useEncounterDraft(encounterId, methods, restored);
  const { complete, marks, send } = useCompletion(encounterId, methods, draft.forget);
  const handleInvalid = (errors: FieldErrors<CompleteEncounterForm>): void => {
    const path: string | null = firstErrorPath(errors);
    if (path !== null) focusAfterRender(methods, path);
  };
  const completeAsEmergency = (reason: string): void => void methods.handleSubmit((values) => send(values, reason), handleInvalid)();
  const startOver = (): void => {
    methods.reset(DEFAULT_VALUES);
    draft.clear();
  };
  return { methods, complete, onSubmit: methods.handleSubmit((values) => send(values), handleInvalid), completeAsEmergency, draft, startOver, ...marks };
}
