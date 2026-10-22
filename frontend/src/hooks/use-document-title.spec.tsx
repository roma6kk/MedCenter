import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useUiStore } from '@/store/use-ui-store';
import { useDocumentTitle } from './use-document-title';

function Page({ title, withBrand }: { readonly title: string; readonly withBrand?: boolean }): ReactNode {
  useDocumentTitle(title, withBrand);
  return null;
}

describe('useDocumentTitle', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
    document.title = 'Медицинский центр';
  });

  it('should set the tab title to the page name and the brand when the page mounts', () => {
    render(<Page title="Мои записи" />);

    expect(document.title).toBe('Мои записи — Лайфлайн');
  });

  it('should follow the title when the page name changes', () => {
    const { rerender } = render(<Page title="Мои записи" />);

    rerender(<Page title="История" />);

    expect(document.title).toBe('История — Лайфлайн');
  });

  it('should restore the previous title when the page unmounts', () => {
    const { unmount } = render(<Page title="Мои записи" />);

    unmount();

    expect(document.title).toBe('Медицинский центр');
  });

  it('should use the English brand when the interface is switched to English', () => {
    render(<Page title="My appointments" />);

    act(() => useUiStore.setState({ locale: 'en' }));

    expect(document.title).toBe('My appointments — Lifeline');
  });

  it('should show the bare title when the page asks for no brand', () => {
    render(<Page title="Медицинский центр" withBrand={false} />);

    expect(document.title).toBe('Медицинский центр');
  });
});
