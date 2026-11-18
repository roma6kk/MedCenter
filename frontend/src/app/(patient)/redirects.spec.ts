const mockRedirect = jest.fn((target: string): never => {
  throw new Error(`redirect:${target}`);
});
jest.mock('next/navigation', () => ({ redirect: (target: string) => mockRedirect(target) }));

import HistoryPage from './history/page';
import PrescriptionsPage from './prescriptions/page';
import ProfilePage from './profile/page';

describe('the old addresses of the cabinet', () => {
  it.each([
    ['/profile', ProfilePage, '/home'],
    ['/history', HistoryPage, '/medcard'],
    ['/prescriptions', PrescriptionsPage, '/medcard?tab=prescriptions'],
  ] as const)('should send %s to %s', (_route, page, target) => {
    expect(() => page()).toThrow(`redirect:${target}`);
  });
});
