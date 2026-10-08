import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AtcCodeField } from './atc-code-field';

describe('AtcCodeField', () => {
  it('should upper-case the code as the user types', async () => {
    render(<AtcCodeField aria-label="АТХ" />);
    const input = screen.getByRole('textbox', { name: 'АТХ' });

    await userEvent.type(input, 'n02be01');

    expect(input).toHaveValue('N02BE01');
  });

  it('should forward the ref to the underlying input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<AtcCodeField ref={ref} aria-label="АТХ" />);

    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'АТХ' }));
  });
});
