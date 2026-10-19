import { redirect } from 'next/navigation';
import AdminIndexPage from './page';

jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

describe('AdminIndexPage', () => {
  it('should send /admin to the analytics dashboard when the admin opens the area without a page', () => {
    AdminIndexPage();

    expect(redirect).toHaveBeenCalledWith('/admin/analytics');
  });
});
