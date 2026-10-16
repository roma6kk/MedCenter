import { SmokeRunner, countOf, exitCodeOf, formatTable } from './smoke-runner';
import type { CheckResult } from './smoke-types';

function result(group: string, name: string, outcome: CheckResult['outcome'], detail?: string): CheckResult {
  return { group, name, outcome, millis: 1, ...(detail === undefined ? {} : { detail }) };
}

describe('SmokeRunner', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('should record PASS when the check resolves', async () => {
    const runner = new SmokeRunner();

    const passed = await runner.check('g', 'works', async () => undefined);

    expect([passed, runner.results[0]?.outcome]).toEqual([true, 'PASS']);
  });

  it('should record FAIL with the one-line reason when the check throws, and keep running', async () => {
    const runner = new SmokeRunner();

    const passed = await runner.check('g', 'breaks', async () => {
      throw new Error('line one\n  line two');
    });
    await runner.check('g', 'next', async () => undefined);

    expect(passed).toBe(false);
    expect(runner.results.map((entry) => entry.outcome)).toEqual(['FAIL', 'PASS']);
    expect(runner.results[0]?.detail).toBe('line one line two');
  });

  it('should skip the rest of a chain after the first failing step and say which one failed', async () => {
    const runner = new SmokeRunner();
    const ran: string[] = [];

    await runner.chain('chain', [
      { name: 'one', run: async () => void ran.push('one') },
      {
        name: 'two',
        run: async () => {
          throw new Error('nope');
        },
      },
      { name: 'three', run: async () => void ran.push('three') },
    ]);

    expect(ran).toEqual(['one']);
    expect(runner.results.map((entry) => entry.outcome)).toEqual(['PASS', 'FAIL', 'SKIP']);
    expect(runner.results[2]?.detail).toContain('"two"');
  });

  it('should report a step under its own group when the step names one', async () => {
    const runner = new SmokeRunner();

    await runner.chain('chain', [{ name: 'one', group: 'other', run: async () => undefined }]);

    expect(runner.results[0]?.group).toBe('other');
  });
});

describe('exitCodeOf', () => {
  it('should be 0 only when every check passed', () => {
    expect(exitCodeOf([result('g', 'a', 'PASS'), result('g', 'b', 'PASS')])).toBe(0);
  });

  it('should be 1 when a check failed', () => {
    expect(exitCodeOf([result('g', 'a', 'PASS'), result('g', 'b', 'FAIL')])).toBe(1);
  });

  it('should be 1 when a check was skipped, because a skip is a hole in the coverage', () => {
    expect(exitCodeOf([result('g', 'a', 'PASS'), result('g', 'b', 'SKIP')])).toBe(1);
  });

  it('should be 1 when nothing ran at all', () => {
    expect(exitCodeOf([])).toBe(1);
  });
});

describe('formatTable', () => {
  const results = [
    result('edge', 'a', 'PASS'),
    result('edge', 'b', 'PASS'),
    result('chain', 'c', 'FAIL', 'boom'),
    result('chain', 'd', 'SKIP', 'needs "c"'),
  ];

  it('should show one row per group with its counts and status', () => {
    const table = formatTable(results);

    expect(table).toMatch(/edge\s+2\s+0\s+0\s+PASS/);
    expect(table).toMatch(/chain\s+0\s+1\s+1\s+FAIL/);
  });

  it('should list every failure with its reason and summarise the skips per group', () => {
    const table = formatTable(results);

    expect(table).toContain('FAIL chain :: c: boom');
    expect(table).toContain('SKIP chain: 1 check(s) not run');
    expect(table).toContain('TOTAL 2 passed, 1 failed, 1 skipped');
  });

  it('should count outcomes', () => {
    expect(countOf(results, 'PASS')).toBe(2);
  });
});
