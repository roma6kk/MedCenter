import { medicationFixture, serviceFixture } from '../cabinet-fixtures';
import { activeCounts, filterByStatus, groupByEncounter, statusBucket } from './prescription-logic';

describe('statusBucket', () => {
  it.each([
    ['active', 'active'],
    ['completed', 'closed'],
    ['cancelled', 'closed'],
    ['revoked', 'closed'],
    ['entered-in-error', 'closed'],
    ['on-hold', 'other'],
    ['draft', 'other'],
    ['something-new', 'other'],
  ])('should put %s into the %s bucket', (status, bucket) => {
    expect(statusBucket(status)).toBe(bucket);
  });
});

describe('filterByStatus', () => {
  const items = [medicationFixture({ id: 'a' }), serviceFixture({ id: 'b', status: 'completed' }), medicationFixture({ id: 'c', status: 'on-hold' })];

  it('should keep only running items for the active filter', () => {
    expect(filterByStatus(items, 'active').map((i) => i.id)).toEqual(['a']);
  });

  it('should keep only closed items for the closed filter', () => {
    expect(filterByStatus(items, 'closed').map((i) => i.id)).toEqual(['b']);
  });

  it('should keep everything, paused items included, for the all filter', () => {
    expect(filterByStatus(items, 'all')).toHaveLength(3);
  });
});

describe('groupByEncounter', () => {
  it('should group by encounter, newest visit first, and put items without an encounter last', () => {
    const groups = groupByEncounter([
      medicationFixture({ id: 'old', encounterId: 'e1', authoredOn: '2026-09-01T08:00:00.000Z' }),
      medicationFixture({ id: 'loose', encounterId: undefined, authoredOn: '2026-11-01T08:00:00.000Z' }),
      serviceFixture({ id: 'new', encounterId: 'e2', authoredOn: '2026-10-12T08:00:00.000Z' }),
      serviceFixture({ id: 'old2', encounterId: 'e1', authoredOn: '2026-08-31T08:00:00.000Z' }),
    ]);

    expect(groups.map((g) => [g.encounterId, g.items.map((i) => i.id)])).toEqual([['e2', ['new']], ['e1', ['old', 'old2']], [null, ['loose']]]);
    expect(groups[1]?.date).toBe('2026-08-31T08:00:00.000Z');
  });

  it('should return no groups for no items and no other group when every item has an encounter', () => {
    expect(groupByEncounter([])).toEqual([]);
    expect(groupByEncounter([medicationFixture()]).map((g) => g.encounterId)).toEqual(['enc-1']);
  });

  it('should leave the date empty when no item of the group has one', () => {
    expect(groupByEncounter([medicationFixture({ authoredOn: undefined })])[0]?.date).toBeUndefined();
  });
});

describe('activeCounts', () => {
  it('should count running medications and services separately and ignore closed ones', () => {
    const counts = activeCounts([medicationFixture(), medicationFixture({ id: 'm2' }), serviceFixture({ status: 'active' }), serviceFixture({ id: 's2' })]);

    expect(counts).toEqual({ medications: 2, services: 1 });
  });
});
