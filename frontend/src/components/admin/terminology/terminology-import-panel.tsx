'use client';

import type { BaseSyntheticEvent, ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { useT } from '@/lib/i18n/use-t';
import { CONTROL_CLASS, PANEL_CLASS } from '../shared/admin-styles';
import type { ServerFieldRule } from '../shared/apply-server-error';
import { controlProps, Field } from '../shared/form-field';
import { SubmitButton } from '../shared/submit-button';
import { useFormBanner, type FormBanner } from '../shared/use-form-banner';
import { useFormMessage } from '../shared/use-form-message';
import { ImportOutcome } from './import-outcome';
import { DEFAULT_IMPORT_VALUES, importSchema, type ImportFormValues } from './import-schema';
import { SNAPSHOT_VERSION_MAX } from './snapshot-version';
import { useStartImport } from './use-terminology';

const FIELDS: ReadonlyArray<string> = ['snapshotVersion'];

interface ImportForm {
  readonly form: UseFormReturn<ImportFormValues>;
  readonly start: ReturnType<typeof useStartImport>;
  readonly banner: FormBanner | null;
  readonly handleSubmit: (event?: BaseSyntheticEvent) => Promise<void>;
  /** The version is edited: the answer to the old one (an accepted import, a refusal) is not the answer any more. */
  readonly handleEdit: () => void;
}

function useImportForm(): ImportForm {
  const tProblems = useT('admin.problems');
  const start = useStartImport();
  const form = useForm<ImportFormValues>({ resolver: zodResolver(importSchema), defaultValues: DEFAULT_IMPORT_VALUES });
  const rules: Readonly<Record<string, ServerFieldRule>> = { SNAPSHOT_NOT_BUNDLED: { field: 'snapshotVersion', message: tProblems('SNAPSHOT_NOT_BUNDLED') } };
  const { banner, fail, clear } = useFormBanner(form, FIELDS, rules);
  const handleSubmit = form.handleSubmit((values) => {
    clear();
    start.mutate({ snapshotVersion: values.snapshotVersion.trim() }, { onError: fail });
  }, clear);
  const handleEdit = (): void => {
    start.reset();
    clear();
  };
  return { form, start, banner, handleSubmit, handleEdit };
}

/**
 * Snapshot import of the terminology (FR-018, API 2.3.4): the release number goes to `POST /admin/terminology/import`.
 * 202 → «импорт принят», 409 `IMPORT_RUNNING` → «уже выполняется», 400 / 422 → the message sits at the version field.
 */
export function TerminologyImportPanel(): ReactNode {
  const t = useT('admin.terminology.import');
  const resolve = useFormMessage();
  const { form, start, banner, handleSubmit, handleEdit } = useImportForm();
  const error: string | undefined = resolve(form.formState.errors.snapshotVersion?.message);
  return (
    <section aria-labelledby="terminology-import-title" className={PANEL_CLASS}>
      <h2 id="terminology-import-title" className="serif text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{t('description')}</p>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="mt-4 flex flex-wrap items-end gap-3">
        <Field id="import-version" label={t('versionLabel')} error={error} hint={t('versionHint')} required>
          <input {...controlProps('import-version', error, t('versionHint'))} maxLength={SNAPSHOT_VERSION_MAX} autoComplete="off" className={`${CONTROL_CLASS} mono`} {...form.register('snapshotVersion', { onChange: handleEdit })} />
        </Field>
        <SubmitButton label={t('run')} pendingLabel={t('running')} isPending={start.isPending} error={start.error} />
      </form>
      <ImportOutcome accepted={start.data} banner={banner} />
    </section>
  );
}
