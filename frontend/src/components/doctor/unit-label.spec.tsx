import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useUiStore } from '@/store/use-ui-store';
import { unitMessageKey, useUnitLabel } from './unit-label';
import ru from '@/messages/ru.json';
import en from '@/messages/en.json';

const SEEDED_UNITS: ReadonlyArray<string> = ['%', '/min', '10*12/L', '10*9/L', 'Cel', 'L', '[iU]', 'cm', 'd', 'g', 'g/L', 'h', 'kg', 'kg/m2', 'mL', 'mg', 'mg/dL', 'mm[Hg]', 'mmol/L', 'ug', 'wk', '{tbl}'];

describe('useUnitLabel', () => {
  afterEach(() => act(() => useUiStore.setState({ locale: 'ru' })));

  it('should show the vital-sign units the way a clinician writes them', () => {
    const { result } = renderHook(() => useUnitLabel());

    expect(result.current('Cel')).toBe('°C');
    expect(result.current('mm[Hg]')).toBe('мм рт. ст.');
    expect(result.current('kg')).toBe('кг');
    expect(result.current('%')).toBe('%');
  });

  it('should tell a pulse from a breathing rate when the observation says which', () => {
    const { result } = renderHook(() => useUnitLabel());

    expect(result.current('/min', '20005')).toBe('уд/мин');
    expect(result.current('/min', '20004')).toBe('дых/мин');
    expect(result.current('/min')).toBe('/мин');
  });

  it('should fall back to the code for a unit it does not know', () => {
    const { result } = renderHook(() => useUnitLabel());

    expect(result.current('mol/m3')).toBe('mol/m3');
  });

  it('should follow the interface language', () => {
    act(() => useUiStore.setState({ locale: 'en' }));
    const { result } = renderHook(() => useUnitLabel());

    expect(result.current('mm[Hg]')).toBe('mmHg');
  });

  it('should have a label in both languages for every unit of the seeded value set', () => {
    const unitsOf = (catalogue: unknown): Record<string, unknown> => (catalogue as { doctor: { unit: Record<string, unknown> } }).doctor.unit;
    for (const unit of SEEDED_UNITS) {
      const key: string | null = unitMessageKey(unit);
      expect(key).not.toBeNull();
      expect(typeof unitsOf(ru)[key ?? '']).toBe('string');
      expect(typeof unitsOf(en)[key ?? '']).toBe('string');
    }
  });
});
