import { render, screen } from '@testing-library/react';
import { StampBadge } from './stamp-badge';

describe('StampBadge', () => {
  it('should render the status label in uppercase', () => {
    render(<StampBadge status="booked" />);

    expect(screen.getByText('BOOKED')).toBeInTheDocument();
  });

  it('should render a custom label when children are provided', () => {
    render(<StampBadge status="free">Свободно</StampBadge>);

    expect(screen.getByText('Свободно')).toBeInTheDocument();
  });
});
