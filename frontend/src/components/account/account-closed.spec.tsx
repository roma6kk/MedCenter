import { render, screen } from '@testing-library/react';
import { AccountClosed } from './account-closed';

describe('AccountClosed', () => {
  it('should confirm the deletion and explain what the clinic keeps and why', () => {
    render(<AccountClosed />);

    expect(screen.getByRole('heading', { level: 1, name: 'Учётная запись удалена' })).toBeInTheDocument();
    expect(screen.getByText(/хранятся по требованию законодательства о здравоохранении, срок — по номенклатуре дел оператора/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'политике обработки персональных данных' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
  });
});
