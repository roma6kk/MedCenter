import { createTranslate } from '@/lib/i18n/translate';
import { presetRange } from './analytics-period';
import { periodDays, periodTitle } from './period-title';

const t = createTranslate('ru', 'admin.analytics');
const TODAY = '2026-10-28';

describe('periodTitle', () => {
  it('should name the period the heading covers, never a generated conclusion', () => {
    expect(periodTitle({ preset: 'today', range: presetRange('today', TODAY), top: 10 }, t, 'ru')).toBe('Аналитика за сегодня');
    expect(periodTitle({ preset: 'week', range: presetRange('week', TODAY), top: 10 }, t, 'ru')).toBe('Аналитика за неделю');
    expect(periodTitle({ preset: 'month', range: presetRange('month', TODAY), top: 10 }, t, 'ru')).toMatch(/^Аналитика за октябрь 2026/);
    expect(periodTitle({ preset: 'year', range: presetRange('year', TODAY), top: 10 }, t, 'ru')).toBe('Аналитика за 2026 год');
    expect(periodTitle({ preset: 'custom', range: { from: '2026-09-01', to: '2026-09-30' }, top: 10 }, t, 'ru')).toBe('Аналитика за 01.09.2026 – 30.09.2026');
  });

  it('should write the English headings in English', () => {
    const en = createTranslate('en', 'admin.analytics');

    expect(periodTitle({ preset: 'month', range: presetRange('month', TODAY), top: 10 }, en, 'en')).toBe('Analytics for October 2026');
  });
});

describe('periodDays', () => {
  it('should give the exact days of a period and the weekday of today', () => {
    expect(periodDays({ preset: 'week', range: presetRange('week', TODAY), top: 10 }, t, 'ru')).toBe('Отчёт · 26.10.2026 – 01.11.2026');
    expect(periodDays({ preset: 'today', range: presetRange('today', TODAY), top: 10 }, t, 'ru')).toBe('среда, 28 октября');
  });
});
