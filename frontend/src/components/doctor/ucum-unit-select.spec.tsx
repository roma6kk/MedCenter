import { render, screen } from '@testing-library/react';
import { UCUM_UNITS } from '@/lib/contracts';
import { UcumUnitSelect } from './ucum-unit-select';

describe('UcumUnitSelect', () => {
  it('should offer exactly the UCUM units from the contracts snapshot (select-only, BR-009)', () => {
    render(<UcumUnitSelect aria-label="Единица" />);
    const options = screen.getAllByRole('option').map((option) => option.textContent);

    expect(options).toEqual([...UCUM_UNITS]);
  });
});
