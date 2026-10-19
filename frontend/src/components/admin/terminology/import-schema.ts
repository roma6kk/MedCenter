/** import-schema — the snapshot import form, same rule as the server's `ImportTerminologyDto`. Messages are message KEYS. */
import { z } from 'zod';
import { DEFAULT_SNAPSHOT_VERSION, SNAPSHOT_VERSION_MAX, SNAPSHOT_VERSION_PATTERN } from './snapshot-version';

export const importSchema = z.object({
  snapshotVersion: z
    .string()
    .trim()
    .min(1, 'validation.required')
    .max(SNAPSHOT_VERSION_MAX, 'validation.tooLong')
    .regex(SNAPSHOT_VERSION_PATTERN, 'admin.terminology.validation.version'),
});

export type ImportFormValues = z.infer<typeof importSchema>;

export const DEFAULT_IMPORT_VALUES: ImportFormValues = { snapshotVersion: DEFAULT_SNAPSHOT_VERSION };
