'use client';

import { useCallback } from 'react';
import { useT } from '@/lib/i18n/use-t';

/**
 * UCUM codes as the doctor reads them. The stored value stays the UCUM code (`Cel`, `mm[Hg]`: that is what the service
 * validates and what other systems exchange); only what is drawn changes. The keys are message keys of `doctor.unit`
 * (a UCUM code has characters a message path cannot carry).
 */
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

/** `/min` alone does not say whether a pulse or a breath is counted; the seeded observation concepts that count one say it. */
const PER_MINUTE_BY_OBSERVATION: Readonly<Record<string, string>> = { '20004': 'breathsPerMinute', '20005': 'beatsPerMinute' };

/** The message key (under `doctor.unit`) of a unit, or `null` for a code this list does not know. */
export function unitMessageKey(unit: string, observationCode?: string): string | null {
  if (unit === '/min' && observationCode !== undefined) return PER_MINUTE_BY_OBSERVATION[observationCode] ?? UNIT_KEYS[unit] ?? null;
  return UNIT_KEYS[unit] ?? null;
}

/** `(unit, observationCode?) => '°C'`: the human label of a UCUM code in the interface language, the code itself when unknown. */
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
