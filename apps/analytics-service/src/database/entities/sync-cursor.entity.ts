import { Column, Entity, PrimaryColumn } from 'typeorm';

import { ANALYTICS_SCHEMA } from '../analytics-schema';

/** High-water mark of a pull from HAPI (`meta.lastUpdated` of the newest copied resource). */
@Entity({ name: 'sync_cursor', schema: ANALYTICS_SCHEMA })
export class SyncCursorEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ name: 'cursor_value', type: 'timestamptz' })
  cursorValue!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
