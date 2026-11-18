'use client';

import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useFormContext, useFormState, type FieldPath } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import type { CompleteEncounterForm } from '@/lib/contracts';
import { a11yOf, errorAt, INPUT_CLASS } from './encounter-form-helpers';

interface FieldRowProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly children: ReactNode;
}

export function FieldRow({ id, label, error, children }: FieldRowProps): ReactNode {
  return (
    <div>
      <label htmlFor={id} className="form-label block">{label}</label>
      {children}
      {error ? <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

interface TextRowFieldProps {
  readonly name: FieldPath<CompleteEncounterForm>;
  readonly id: string;
  readonly label: string;
  readonly placeholder?: string;
}

export function TextRowField({ name, id, label, placeholder }: TextRowFieldProps): ReactNode {
  const { control, register } = useFormContext<CompleteEncounterForm>();
  const { errors } = useFormState({ control, name });
  const error: string | undefined = errorAt(errors, name);
  return (
    <div className="mt-2">
      <FieldRow id={id} label={label} error={error}>
        <input id={id} {...register(name)} {...a11yOf(id, error)} className={INPUT_CLASS} placeholder={placeholder} autoComplete="off" />
      </FieldRow>
    </div>
  );
}

export function RemoveRowButton({ onClick, label, ariaLabel }: { readonly onClick: () => void; readonly label: string; readonly ariaLabel: string }): ReactNode {
  return (
    <Button variant="quiet-danger" onClick={onClick} aria-label={ariaLabel} className="mt-2">
      <Trash2 aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}

interface AddRowButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

export function AddRowButton({ label, onClick, disabled }: AddRowButtonProps): ReactNode {
  return (
    <Button variant="secondary" onClick={onClick} disabled={disabled} className="mt-4">
      <Plus aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}

interface EmptyListLineProps {
  readonly message: string;
  readonly addLabel: string;
  readonly onAdd: () => void;
}

export function EmptyListLine({ message, addLabel, onAdd }: EmptyListLineProps): ReactNode {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <span>{message} ·</span>
      <Button variant="soft" onClick={onAdd}>
        <Plus aria-hidden="true" className="size-4" />
        {addLabel}
      </Button>
    </p>
  );
}
