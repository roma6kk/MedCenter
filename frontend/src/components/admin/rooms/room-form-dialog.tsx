'use client';

import type { ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { useT } from '@/lib/i18n/use-t';
import { EMPTY_ROOM_VALUES, roomSchema, roomValuesOf, toRoomPayload, type RoomFormValues } from './room-schema';
import type { AdminRoom } from './room-types';
import { FormProblem } from '../shared/admin-problem';
import { CONTROL_CLASS } from '../shared/admin-styles';
import { FormActions } from '../shared/form-actions';
import { messagesOf, type FieldMessages } from '../shared/form-errors';
import { controlProps, Field } from '../shared/form-field';
import { Modal } from '../shared/modal';
import { useFormBanner } from '../shared/use-form-banner';
import { useFormMessage } from '../shared/use-form-message';
import { useCreateRoom, useUpdateRoom } from './use-admin-rooms';

type RoomField = keyof RoomFormValues;
const FIELDS: ReadonlyArray<string> = ['identifier', 'name', 'floor', 'description'];

interface FieldsProps {
  readonly register: (name: RoomField) => UseFormRegisterReturn;
  readonly errors: FieldMessages<RoomField>;
}

function RoomFields({ register, errors }: FieldsProps): ReactNode {
  const t = useT('admin.rooms');
  return (
    <div className="mt-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="room-identifier" label={t('fields.identifier')} error={errors.identifier} hint={t('hints.identifier')} required>
          <input {...controlProps('room-identifier', errors.identifier, t('hints.identifier'))} autoComplete="off" className={`${CONTROL_CLASS} mono`} {...register('identifier')} />
        </Field>
        <Field id="room-floor" label={t('fields.floor')} error={errors.floor}>
          <input {...controlProps('room-floor', errors.floor)} type="number" inputMode="numeric" className={CONTROL_CLASS} {...register('floor')} />
        </Field>
      </div>
      <Field id="room-name" label={t('fields.name')} error={errors.name} required>
        <input {...controlProps('room-name', errors.name)} autoComplete="off" className={CONTROL_CLASS} {...register('name')} />
      </Field>
      <Field id="room-description" label={t('fields.description')} error={errors.description}>
        <textarea {...controlProps('room-description', errors.description)} rows={3} className={CONTROL_CLASS} {...register('description')} />
      </Field>
    </div>
  );
}

function RoomForm({ room, onClose }: { readonly room?: AdminRoom; readonly onClose: () => void }): ReactNode {
  const t = useT('admin.rooms');
  const resolve = useFormMessage();
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const mutation = room === undefined ? create : update;
  const form = useForm<RoomFormValues>({ resolver: zodResolver(roomSchema), defaultValues: room === undefined ? EMPTY_ROOM_VALUES : roomValuesOf(room) });
  const { register, handleSubmit, formState } = form;
  const { banner, fail, clear } = useFormBanner(form, FIELDS);
  const submit = handleSubmit((values) => {
    clear();
    const payload = toRoomPayload(values, room !== undefined);
    if (room === undefined) create.mutate(payload, { onSuccess: onClose, onError: fail });
    else update.mutate({ id: room.id, payload }, { onSuccess: onClose, onError: fail });
  }, clear);
  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <RoomFields register={register} errors={messagesOf<RoomField, RoomFormValues>(formState.errors, resolve)} />
      <FormProblem banner={banner} />
      <FormActions submitLabel={room === undefined ? t('create') : t('save')} isPending={mutation.isPending} onCancel={onClose} error={mutation.error} />
    </form>
  );
}

interface RoomFormDialogProps {
  readonly room?: AdminRoom;
  readonly onClose: () => void;
}

/** Create (`POST /admin/rooms`) or edit (`PATCH`) dialog of a room (FR-017). */
export function RoomFormDialog({ room, onClose }: RoomFormDialogProps): ReactNode {
  const t = useT('admin.rooms');
  return (
    <Modal title={room === undefined ? t('createTitle') : t('editTitle')} onClose={onClose}>
      <RoomForm {...(room === undefined ? {} : { room })} onClose={onClose} />
    </Modal>
  );
}
