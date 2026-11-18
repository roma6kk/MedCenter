import { defaultScope, presetRange, previousRange, scopeFromParams, scopeToQuery, withToday } from './analytics-period';

const WED = '2026-10-28';

describe('presetRange', () => {
  it('should give the day itself when the period is today', () => {
    expect(presetRange('today', WED)).toEqual({ from: WED, to: WED });
  });

  it('should give Monday to Sunday of the current week when the period is the week', () => {
    expect(presetRange('week', WED)).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(presetRange('week', '2026-10-26')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(presetRange('week', '2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });

  it('should give the whole calendar month, however long, when the period is the month', () => {
    expect(presetRange('month', WED)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('should give the whole calendar year when the period is the year', () => {
    expect(presetRange('year', WED)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});

describe('previousRange', () => {
  it('should step back by the same kind of period for every preset', () => {
    expect(previousRange('today', presetRange('today', WED))).toEqual({ from: '2026-10-27', to: '2026-10-27' });
    expect(previousRange('week', presetRange('week', WED))).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(previousRange('month', presetRange('month', WED))).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(previousRange('month', presetRange('month', '2026-03-15'))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousRange('year', presetRange('year', WED))).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('should give as many days directly before a custom period', () => {
    expect(previousRange('custom', { from: '2026-10-10', to: '2026-10-19' })).toEqual({ from: '2026-09-30', to: '2026-10-09' });
  });
});

describe('scopeFromParams / scopeToQuery', () => {
  it('should default to this month when the address names no period', () => {
    expect(scopeFromParams(new URLSearchParams(''), WED)).toEqual(defaultScope(WED));
    expect(scopeToQuery(defaultScope(WED))).toBe('');
  });

  it('should read a preset and a top from the address and write them back', () => {
    const scope = scopeFromParams(new URLSearchParams('period=week&top=20'), WED);

    expect(scope).toEqual({ preset: 'week', range: { from: '2026-10-26', to: '2026-11-01' }, top: 20 });
    expect(scopeToQuery(scope)).toBe('period=week&top=20');
  });

  it('should keep a valid custom period in the address', () => {
    const scope = scopeFromParams(new URLSearchParams('period=custom&from=2026-09-01&to=2026-09-30'), WED);

    expect(scope.range).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(scopeToQuery(scope)).toBe('period=custom&from=2026-09-01&to=2026-09-30');
  });

  it('should fall back to this month when the address holds nonsense', () => {
    expect(scopeFromParams(new URLSearchParams('period=decade'), WED).preset).toBe('month');
    expect(scopeFromParams(new URLSearchParams('period=custom&from=2026-09-30&to=2026-09-01'), WED).preset).toBe('month');
    expect(scopeFromParams(new URLSearchParams('period=custom&from=x'), WED).preset).toBe('month');
    expect(scopeFromParams(new URLSearchParams('top=7'), WED).top).toBe(10);
  });
});

describe('withToday', () => {
  it('should move a preset to the new day and leave a custom period alone', () => {
    expect(withToday(defaultScope(WED), '2026-11-02').range).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    const custom = scopeFromParams(new URLSearchParams('period=custom&from=2026-09-01&to=2026-09-30'), WED);
    expect(withToday(custom, '2026-11-02')).toBe(custom);
  });
});
