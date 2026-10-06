import { render, screen } from '@testing-library/react';
import { CodeChip } from './code-chip';

describe('CodeChip', () => {
  it('should render the terminology code', () => {
    render(<CodeChip code="J06.9" system="https://fhir.by/CodeSystem/InternClassificDiseases10" />);

    expect(screen.getByTestId('code-chip')).toHaveTextContent('J06.9');
  });
});
