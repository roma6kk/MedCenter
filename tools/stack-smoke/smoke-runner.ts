import type { CheckResult, Outcome } from './smoke-types';

/** One named step of a group; later steps of a chain depend on the earlier ones. */
export interface SmokeStep {
  readonly name: string;
  readonly run: () => Promise<void>;
  /** Reported group of this step; defaults to the group of the chain. */
  readonly group?: string;
}

function reasonOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ');
}

/** Collects the outcome of every check; a throwing check is a FAIL, never an abort. */
export class SmokeRunner {
  private readonly collected: CheckResult[] = [];

  get results(): readonly CheckResult[] {
    return this.collected;
  }

  /** Runs one check; resolves to `true` when it passed. */
  async check(group: string, name: string, run: () => Promise<void>): Promise<boolean> {
    const started = Date.now();
    try {
      await run();
      this.record({ group, name, outcome: 'PASS', millis: Date.now() - started });
      return true;
    } catch (error: unknown) {
      this.record({ group, name, outcome: 'FAIL', millis: Date.now() - started, detail: reasonOf(error) });
      return false;
    }
  }

  skip(group: string, name: string, reason: string): void {
    this.record({ group, name, outcome: 'SKIP', millis: 0, detail: reason }, false);
  }

  /** Steps in order; after the first failure the rest are SKIPped, because each needs what the previous one made. */
  async chain(group: string, steps: readonly SmokeStep[]): Promise<void> {
    let failedStep: string | undefined;
    for (const step of steps) {
      const reported = step.group ?? group;
      if (failedStep !== undefined) {
        this.skip(reported, step.name, `needs "${failedStep}", which failed`);
      } else if (!(await this.check(reported, step.name, step.run))) {
        failedStep = step.name;
      }
    }
  }

  private record(result: CheckResult, print = true): void {
    this.collected.push(result);
    if (!print) {
      return;
    }
    const mark = result.outcome === 'PASS' ? 'ok  ' : 'FAIL';
    console.log(`${mark} ${result.group} :: ${result.name}${result.detail === undefined ? '' : `  -- ${result.detail}`}`);
  }
}

/** Zero only when every check passed: a SKIP is a hole in coverage, so it fails the run too. */
export function exitCodeOf(results: readonly CheckResult[]): 0 | 1 {
  return results.length > 0 && results.every((result) => result.outcome === 'PASS') ? 0 : 1;
}

export function countOf(results: readonly CheckResult[], outcome: Outcome): number {
  return results.filter((result) => result.outcome === outcome).length;
}

/** The compact pass/fail table: one row per group with its counts, then every failed or skipped check. */
export function formatTable(results: readonly CheckResult[]): string {
  const groups = [...new Set(results.map((result) => result.group))];
  const rows = groups.map((group) => {
    const own = results.filter((result) => result.group === group);
    const status = own.every((result) => result.outcome === 'PASS') ? 'PASS' : 'FAIL';
    return [group, String(countOf(own, 'PASS')), String(countOf(own, 'FAIL')), String(countOf(own, 'SKIP')), status];
  });
  const table = [['group', 'pass', 'fail', 'skip', 'status'], ...rows];
  const widths = table[0].map((_, column) => Math.max(...table.map((row) => row[column].length)));
  const lines = table.map((row) => row.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd());
  const failed = results.filter((result) => result.outcome === 'FAIL').map((result) => `FAIL ${result.group} :: ${result.name}: ${result.detail ?? ''}`);
  const skipped = groups.flatMap((group) => {
    const own = results.filter((result) => result.group === group && result.outcome === 'SKIP');
    return own.length === 0 ? [] : [`SKIP ${group}: ${own.length} check(s) not run, e.g. "${own[0]?.name}" (${own[0]?.detail ?? ''})`];
  });
  const problems = [...failed, ...skipped];
  const total = `TOTAL ${countOf(results, 'PASS')} passed, ${countOf(results, 'FAIL')} failed, ${countOf(results, 'SKIP')} skipped`;
  return [...lines, '', ...problems, ...(problems.length > 0 ? [''] : []), total].join('\n');
}
