import { render, screen } from '@testing-library/react';
import { LONG_UNBROKEN_TEXT } from './cabinet-fixtures';
import { expectWraps } from './cabinet-test-utils';
import { DefinitionList, DefinitionRow } from './definition-list';

describe('DefinitionList', () => {
  it('should pair every label with its value as a term list', () => {
    render(<DefinitionList><DefinitionRow label="Врач">Иванова</DefinitionRow></DefinitionList>);

    expect(screen.getByText('Врач').tagName).toBe('DT');
    expect(screen.getByText('Иванова').tagName).toBe('DD');
  });

  it('should let a value without any space wrap and shrink so it cannot push the page wider than the screen', () => {
    render(<DefinitionList><DefinitionRow label="Причина">{LONG_UNBROKEN_TEXT}</DefinitionRow></DefinitionList>);

    expectWraps(screen.getByText(LONG_UNBROKEN_TEXT));
  });
});
