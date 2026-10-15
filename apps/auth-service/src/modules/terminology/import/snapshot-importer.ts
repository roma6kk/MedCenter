import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import { upsertCanonical, type UpsertResult } from './canonical-upsert';
import { SNAPSHOT_VERSION, buildCodeSystems, buildValueSets } from './snapshot-resources';
import { DEFAULT_VERIFY_OPTIONS, verifySnapshot, type ExpansionReport, type VerifyOptions } from './snapshot-verifier';

/** Overrides the verification pacing (tests; HAPI's pre-expansion wait is 20 s by default). */
export const IMPORT_VERIFY_OPTIONS = Symbol('IMPORT_VERIFY_OPTIONS');

export interface ImportSummary {
  readonly snapshotVersion: string;
  readonly created: number;
  readonly updated: number;
  /** `Type/id` of every CodeSystem and ValueSet written, ids as HAPI holds them. */
  readonly resources: readonly string[];
  readonly expansions: readonly ExpansionReport[];
}

/**
 * Publishes the bundled terminology snapshot (ADR-016) to HAPI and proves it
 * is served. Idempotent: every resource is written with `PUT` on the id of the
 * copy that already holds its canonical (or on a deterministic id), so a re-run
 * updates in place and never duplicates. The in-service counterpart of the CLI
 * `tools/terminology-seed`, which publishes the very same snapshot.
 */
@Injectable()
export class SnapshotImporter {
  private readonly logger = new Logger(SnapshotImporter.name);

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    @Optional() @Inject(IMPORT_VERIFY_OPTIONS) private readonly verifyOptions: VerifyOptions = DEFAULT_VERIFY_OPTIONS,
  ) {}

  async run(): Promise<ImportSummary> {
    const upserts = await this.upsertAll();
    const expansions = await verifySnapshot(this.fhir, this.verifyOptions);
    return {
      snapshotVersion: SNAPSHOT_VERSION,
      created: upserts.filter((upsert) => upsert.action === 'created').length,
      updated: upserts.filter((upsert) => upsert.action === 'updated').length,
      resources: upserts.map((upsert) => `${upsert.resourceType}/${upsert.id}`),
      expansions,
    };
  }

  private async upsertAll(): Promise<UpsertResult[]> {
    const results: UpsertResult[] = [];
    // CodeSystems first: a ValueSet that includes a system HAPI does not know yet cannot be expanded.
    for (const resource of [...buildCodeSystems(), ...buildValueSets()]) {
      const result = await upsertCanonical(this.fhir, resource);
      this.logger.log(
        { action: result.action, resource: `${result.resourceType}/${result.id}`, url: result.url, retired: result.retireIds },
        'Terminology resource upserted',
      );
      results.push(result);
    }
    return results;
  }
}
