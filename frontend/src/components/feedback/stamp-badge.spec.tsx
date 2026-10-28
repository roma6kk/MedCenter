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

  it.each([
    ['booked', 'bg-primary-soft'],
    ['fulfilled', 'bg-success-soft'],
    ['cancelled', 'bg-destructive-soft'],
    ['noshow', 'bg-warning-soft'],
    ['busy', 'bg-secondary'],
  ] as const)('should tint the %s status with %s and draw an icon next to the word', (status, ground) => {
    render(<StampBadge status={status} />);

    const badge = screen.getByTestId(`stamp-${status}`);
    expect(badge).toHaveClass(ground);
    expect(badge.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('should let the caller soften the tone when the state is not an alarm, like a deactivated account', () => {
    render(<StampBadge status="cancelled" tone="neutral">Деактивирован</StampBadge>);

    expect(screen.getByTestId('stamp-cancelled')).toHaveClass('bg-secondary');
  });

  it('should let the caller replace the fill of the tone when the badge sits on a ground of its own colour', () => {
    render(<StampBadge status="noshow" className="bg-card ring-1" />);

    const badge = screen.getByTestId('stamp-noshow');

    expect(badge).toHaveClass('bg-card', 'ring-1', 'text-warning');
    expect(badge).not.toHaveClass('bg-warning-soft');
  });
});

