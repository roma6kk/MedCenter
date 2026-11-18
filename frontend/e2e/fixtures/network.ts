import type { Response } from '@playwright/test';

export const isPostTo =
  (target: string | RegExp) =>
  (response: Response): boolean =>
    (typeof target === 'string' ? response.url().endsWith(target) : target.test(response.url())) && response.request().method() === 'POST';
