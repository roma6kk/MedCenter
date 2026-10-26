'use client';

import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FieldRowProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly children: ReactNode;
}

/** A labelled field with its error underneath (announced; the input points at it through `aria-describedby`). */
export function FieldRow({ id, label, error, children }: FieldRowProps): ReactNode {
  return (
    <div>
      <label htmlFor={id} className="form-label block">{label}</label>
      {children}
      {error ? <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

/** Removing a row is the one destructive action of the form: the quiet red button with an icon, the same everywhere. */
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

/** «+ Добавить …» under the rows of a list. */
export function AddRowButton({ label, onClick, disabled }: AddRowButtonProps): ReactNode {
  return (
    <Button variant="secondary" onClick={onClick} disabled={disabled} className="mt-4">
      <Plus aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}

interface EmptyListLineProps {
  /** What the list is empty of («Наблюдения не добавлены»). */
  readonly message: string;
  readonly addLabel: string;
  readonly onAdd: () => void;
}

/** An empty repeatable section is one line, not a box with a hole in it (A9): the statement and the way to add. */
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
