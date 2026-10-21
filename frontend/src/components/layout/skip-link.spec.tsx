import { render, screen } from '@testing-library/react';
import { useUiStore } from '@/store/use-ui-store';
import { MAIN_CONTENT_ID, SkipLink } from './skip-link';

describe('SkipLink', () => {
  beforeEach(() => useUiStore.setState({ locale: 'ru' }));

  it('should point at the main landmark when it is rendered', () => {
    render(<SkipLink />);

    expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toHaveAttribute('href', `#${MAIN_CONTENT_ID}`);
  });

  it('should be translated when the interface is English', () => {
    useUiStore.setState({ locale: 'en' });

    render(<SkipLink />);

    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
  });
});
