import type { Doctor } from './catalog-types';
import { directionEntries, directionGridClass } from './home-directions-model';

function doctor(code: string | undefined, specialty?: string): Doctor {
  return { id: `d-${code ?? 'none'}`, firstName: 'И', lastName: 'Ф', name: 'И Ф', ...(code === undefined ? {} : { specialtyCode: code }), ...(specialty === undefined ? {} : { specialty }) };
}

describe('directionEntries', () => {
  it('should keep only the departments that have a doctor when the doctors are known', () => {
    const entries = directionEntries([doctor('419192003'), doctor('394579002')], false);

    expect(entries.map((entry) => entry.key)).toEqual(['therapy', 'cardiology']);
  });

  it('should give a specialty the landing has no copy for its own card with the doctors wording', () => {
    const entries = directionEntries([doctor('419192003'), doctor('999', 'Эндокринолог')], false);

    expect(entries.map((entry) => entry.key)).toEqual(['therapy', '999']);
    expect(entries[1]).toMatchObject({ kind: 'specialty', label: 'Эндокринолог', specialtyCode: '999' });
  });

  it('should add the diagnostics card only when there are services to lead to', () => {
    expect(directionEntries([doctor('419192003')], false).some((entry) => entry.id === 'diagnostics')).toBe(false);
    expect(directionEntries([doctor('419192003')], true).at(-1)).toMatchObject({ id: 'diagnostics', kind: 'services' });
  });

  it('should show no card at all when there are no doctors and no services', () => {
    expect(directionEntries([], false)).toEqual([]);
  });

  it('should keep the known departments, and no diagnostics, when the catalog could not be read', () => {
    const entries = directionEntries(undefined, false);

    expect(entries.map((entry) => entry.key)).toEqual(['therapy', 'cardiology', 'neurology', 'surgery']);
  });

  it('should ignore doctors without a coded specialty', () => {
    expect(directionEntries([doctor(undefined, 'Терапевт')], false)).toEqual([]);
  });

  it('should give every known department its own tone', () => {
    const tones = directionEntries(undefined, false).map((entry) => entry.tone);

    expect(new Set(tones).size).toBe(tones.length);
  });
});

describe('directionGridClass', () => {
  it.each([[1, 'grid-cols-1'], [2, 'md:grid-cols-2'], [4, 'lg:grid-cols-4'], [5, 'lg:grid-cols-3']])('should fit %i cards with %s', (count, expected) => {
    expect(directionGridClass(count)).toContain(expected);
  });
});
