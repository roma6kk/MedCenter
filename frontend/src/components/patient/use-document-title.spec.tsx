import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useDocumentTitle } from './use-document-title';

function Page({ title }: { readonly title: string }): ReactNode {
  useDocumentTitle(title, 'МедЦентр');
  return null;
}

describe('useDocumentTitle', () => {
  beforeEach(() => {
    document.title = 'Медицинский центр';
  });

  it('should set the tab title to the page name and the brand when the page mounts', () => {
    render(<Page title="Мои записи" />);

    expect(document.title).toBe('Мои записи — МедЦентр');
  });

  it('should follow the title when the page name changes', () => {
    const { rerender } = render(<Page title="Мои записи" />);

    rerender(<Page title="История" />);

    expect(document.title).toBe('История — МедЦентр');
  });

  it('should restore the previous title when the page unmounts', () => {
    const { unmount } = render(<Page title="Мои записи" />);

    unmount();

    expect(document.title).toBe('Медицинский центр');
  });
});
