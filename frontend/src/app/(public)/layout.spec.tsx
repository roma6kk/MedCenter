import { render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));
jest.mock('@/lib/auth/session-client', () => ({ ensureSession: jest.fn().mockResolvedValue(undefined) }));

import { Providers } from '@/components/providers';
import { setFlash } from '@/lib/ui/flash-message';
import { useToastStore } from '@/store/use-toast-store';
import PublicGroupLayout from './layout';

describe('PublicGroupLayout', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useToastStore.getState().clear();
  });

  it('should frame the page with the public navigation when a public page is rendered', () => {
    render(<Providers><PublicGroupLayout><p>catalog</p></PublicGroupLayout></Providers>);

    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('catalog');
  });

  it('should show the "session ended" flash when a public page opens after a revoked session', async () => {
    setFlash('session-ended');

    render(<Providers><PublicGroupLayout><p>catalog</p></PublicGroupLayout></Providers>);

    expect(await screen.findByText('Сессия завершена, войдите снова')).toBeInTheDocument();
  });
});
