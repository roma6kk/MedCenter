'use client';

import { useCallback } from 'react';
import { useT } from '@/lib/i18n/use-t';

const UNIT_KEYS: Readonly<Record<string, string>> = {
  '%': 'percent',
  '/min': 'perMinute',
  '10*12/L': 'e12PerLitre',
  '10*9/L': 'e9PerLitre',
  Cel: 'celsius',
  L: 'litre',
  '[iU]': 'internationalUnit',
  cm: 'centimetre',
  d: 'day',
  g: 'gram',
  'g/L': 'gramPerLitre',
  h: 'hour',
  kg: 'kilogram',
  'kg/m2': 'kilogramPerSquareMetre',
  mL: 'millilitre',
  mg: 'milligram',
  'mg/dL': 'milligramPerDecilitre',
  'mm[Hg]': 'mmHg',
  'mmol/L': 'millimolePerLitre',
  ug: 'microgram',
  wk: 'week',
  '{tbl}': 'tablet',
};

const PER_MINUTE_BY_OBSERVATION: Readonly<Record<string, string>> = { '20004': 'breathsPerMinute', '20005': 'beatsPerMinute' };

export function unitMessageKey(unit: string, observationCode?: string): string | null {
  if (unit === '/min' && observationCode !== undefined) return PER_MINUTE_BY_OBSERVATION[observationCode] ?? UNIT_KEYS[unit] ?? null;
  return UNIT_KEYS[unit] ?? null;
}

export function useUnitLabel(): (unit: string, observationCode?: string) => string {
  const t = useT('doctor.unit');
  return useCallback(
    (unit: string, observationCode?: string): string => {
      const key: string | null = unitMessageKey(unit, observationCode);
      return key === null ? unit : t(key);
    },
    [t],
  );
}
