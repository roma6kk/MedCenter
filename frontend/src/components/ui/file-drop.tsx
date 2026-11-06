'use client';

import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import { File as FileIcon, FileImage, FileText, UploadCloud, X } from 'lucide-react';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { useUiStore } from '@/store/use-ui-store';
import { buttonVariants } from './button-variants';

export interface FileDropProps {
  readonly id: string;
  readonly value: File | null;
  readonly onChange: (file: File | null) => void;
  readonly accept: ReadonlyArray<string>;
  readonly maxBytes: number;
  readonly disabled?: boolean;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string | undefined;
  readonly 'aria-required'?: boolean;
}

function typeName(contentType: string): string {
  return (contentType.split('/')[1] ?? contentType).toUpperCase();
}

function iconFor(contentType: string): typeof FileIcon {
  if (contentType === 'application/pdf') return FileText;
  return contentType.startsWith('image/') ? FileImage : FileIcon;
}

type Translate = ReturnType<typeof useT>;

export function formatFileSize(bytes: number, t: Translate, locale: string): string {
  const format = (value: number): string => value.toLocaleString(locale, { maximumFractionDigits: 1 });
  if (bytes >= 1024 * 1024) return t('megabytes', { n: format(bytes / (1024 * 1024)) });
  if (bytes >= 1024) return t('kilobytes', { n: format(bytes / 1024) });
  return t('bytes', { n: format(bytes) });
}

export const FileDrop = forwardRef<HTMLInputElement, FileDropProps>(function FileDrop(
  { id, value, onChange, accept, maxBytes, disabled = false, ...aria },
  forwardedRef,
): ReactNode {
  const t = useT('ui.fileDrop');
  const locale = useUiStore((state) => state.locale);
  const input = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [problem, setProblem] = useState<string | null>(null);
  const hintId: string = useId();
  const problemId: string = useId();
  // The browser keeps the old file name in the input after reset or removal; clear it or the same file fires no change.
  useEffect(() => {
    if (value === null && input.current !== null) input.current.value = '';
  }, [value]);

  const types: string = accept.map(typeName).join(', ');
  const size: string = formatFileSize(maxBytes, t, locale);
  const take = (file: File | undefined): void => {
    if (file === undefined) return;
    if (!accept.includes(file.type)) setProblem(t('wrongType', { types }));
    else if (file.size > maxBytes) setProblem(t('tooLarge', { size }));
    else {
      setProblem(null);
      onChange(file);
    }
  };
  const handlePick = (event: ChangeEvent<HTMLInputElement>): void => {
    take(event.target.files?.[0]);
    event.target.value = '';
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    if (!disabled) take(event.dataTransfer.files[0]);
  };
  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (!disabled) setIsDragging(true);
  };
  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
  };
  const remove = (): void => {
    setProblem(null);
    onChange(null);
  };
  const setInput = (node: HTMLInputElement | null): void => {
    input.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef !== null) forwardedRef.current = node;
  };
  const Icon = value === null ? UploadCloud : iconFor(value.type);
  const describedBy: string = [aria['aria-describedby'], hintId, problem === null ? undefined : problemId].filter(Boolean).join(' ');
  const pickerLabelClass: string = cn(buttonVariants({ variant: 'secondary' }), 'cursor-pointer');
  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-dragging={isDragging ? 'true' : undefined}
      className={cn(
        'rounded-card border border-dashed border-input bg-card p-4 transition-[border-color,background-color] duration-fast ease-out',
        'has-[input:focus-visible]:border-primary has-[input:focus-visible]:shadow-focus',
        isDragging && 'border-primary bg-primary-soft',
        (aria['aria-invalid'] === true || problem !== null) && 'border-destructive',
      )}
    >
      <input
        ref={setInput}
        id={id}
        type="file"
        accept={accept.join(',')}
        disabled={disabled}
        onChange={handlePick}
        aria-invalid={aria['aria-invalid'] === true || problem !== null ? true : undefined}
        aria-required={aria['aria-required']}
        aria-describedby={describedBy}
        className="peer sr-only"
      />
      {value === null ? (
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <Icon aria-hidden="true" className="size-8 shrink-0 text-muted-foreground" />
          <p className="flex-1 text-sm text-foreground">{isDragging ? t('dropActive') : t('prompt')}</p>
          <label htmlFor={id} className={pickerLabelClass}>
            {t('choose')}
          </label>
        </div>
      ) : (
        <div role="status" className="flex flex-wrap items-center gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary-soft-foreground">
            <Icon aria-hidden="true" className="size-6" />
          </span>
          <div className="min-w-0 flex-1 basis-40">
            <p className="truncate text-sm font-semibold text-foreground">
              <span className="sr-only">{t('chosen')}</span>
              {value.name}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="tabular-nums">{formatFileSize(value.size, t, locale)}</span> · {typeName(value.type)}
            </p>
          </div>
          <label htmlFor={id} className={pickerLabelClass}>
            {t('replace')}
          </label>
          <button
            type="button"
            disabled={disabled}
            aria-label={t('remove', { name: value.name })}
            onClick={remove}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-[background-color,color] duration-fast ease-out hover:bg-secondary hover:text-foreground focus-visible:shadow-focus focus-visible:outline-transparent"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      )}
      <p id={hintId} className="mt-3 text-xs text-muted-foreground">
        {t('accepted', { types, size })}
      </p>
      {problem === null ? null : (
        <p id={problemId} role="alert" className="mt-2 text-sm text-destructive">
          {problem}
        </p>
      )}
    </div>
  );
});
