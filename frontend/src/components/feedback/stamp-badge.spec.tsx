import { render, screen } from '@testing-library/react';
import { StampBadge, type StampStatus } from './stamp-badge';
import { useUiStore } from '@/store/use-ui-store';

describe('StampBadge', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
  });

  it('should render the localized status label when no children are given', () => {
    render(<StampBadge status="booked" />);

    expect(screen.getByText('Записан')).toBeInTheDocument();
  });

  it('should render the English label when the locale is en', () => {
    useUiStore.setState({ locale: 'en' });

    render(<StampBadge status="cancelled" />);

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('should render a custom label when children are provided', () => {
    render(<StampBadge status="free">Свободно сейчас</StampBadge>);

    expect(screen.getByText('Свободно сейчас')).toBeInTheDocument();
  });

  it('should label the entered-in-error slot status the admin API can return', () => {
    render(<StampBadge status="entered-in-error" />);

    expect(screen.getByTestId('stamp-entered-in-error')).toHaveTextContent('Недействителен');
  });

  it('should fall back to the raw status when the backend sends one the client has no label for', () => {
    render(<StampBadge status={'waitlist' as StampStatus} />);

    expect(screen.getByTestId('stamp-waitlist')).toHaveTextContent('waitlist');
  });
});
