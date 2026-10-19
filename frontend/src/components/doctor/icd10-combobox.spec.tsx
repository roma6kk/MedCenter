jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { useState } from 'react';
import type { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import type { Term } from './doctor-types';
import { callsTo, renderWithClient, routeApi, type ApiMock } from './doctor-test-utils';
import { Icd10Combobox } from './icd10-combobox';

const apiFetchMock = apiFetch as ApiMock;
const SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';
const TERMS: ReadonlyArray<Term> = [
  { system: SYSTEM, code: 'J06.9', display: 'Острый назофарингит' },
  { system: SYSTEM, code: 'J06.0', display: 'Острый ларингофарингит' },
  { system: SYSTEM, code: 'K21.0', display: 'ГЭРБ с эзофагитом' },
];

interface HarnessProps {
  readonly onChange?: (code: string) => void;
  readonly onSelectTerm?: (term: Term) => void;
  readonly id?: string;
}

function Harness({ onChange, onSelectTerm, id = 'icd10-test' }: HarnessProps): ReactNode {
  const [value, setValue] = useState('');
  return <Icd10Combobox id={id} value={value} onChange={(code) => { setValue(code); onChange?.(code); }} onSelectTerm={onSelectTerm} />;
}

async function typeAndWaitForList(text: string): Promise<HTMLElement> {
  const input = screen.getByRole('combobox');
  await userEvent.type(input, text);
  await screen.findByRole('listbox');
  return input;
}

describe('Icd10Combobox', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => ({ valueSet: 'icd10', total: 3, items: TERMS }) }]);
  });

  it('should search the ICD-10 value set by what was typed', async () => {
    renderWithClient(<Harness />);

    await typeAndWaitForList('J0');

    const [path] = callsTo(apiFetchMock, '/api/v1/terminology/expand').at(-1) ?? [''];
    expect(path).toContain('system=https%3A%2F%2Ffhir.by%2FValueSet%2FInternClassificDiseases10');
    expect(path).toContain('filter=J0');
  });

  it('should upper-case a code typed in lower case', async () => {
    renderWithClient(<Harness />);
    const input = screen.getByRole('combobox');

    await userEvent.type(input, 'j06.9');

    expect(input).toHaveValue('J06.9');
  });

  it('should leave a diagnosis name being searched as typed when it does not look like a code', async () => {
    renderWithClient(<Harness />);
    const input = screen.getByRole('combobox');

    await userEvent.type(input, 'насморк');

    expect(input).toHaveValue('насморк');
  });

  it('should move the active option with ArrowDown and expose aria-activedescendant', async () => {
    renderWithClient(<Harness />);
    const input = await typeAndWaitForList('J0');

    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', 'icd10-test-option-0');

    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', 'icd10-test-option-1');
  });

  it('should jump to the last and first options with End and Home', async () => {
    renderWithClient(<Harness />);
    const input = await typeAndWaitForList('J0');

    await userEvent.keyboard('{End}');
    expect(input).toHaveAttribute('aria-activedescendant', 'icd10-test-option-2');

    await userEvent.keyboard('{Home}');
    expect(input).toHaveAttribute('aria-activedescendant', 'icd10-test-option-0');
  });

  it('should select the active option and hand its term over when Enter is pressed', async () => {
    const onChange = jest.fn();
    const onSelectTerm = jest.fn();
    renderWithClient(<Harness onChange={onChange} onSelectTerm={onSelectTerm} />);
    await typeAndWaitForList('J0');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenLastCalledWith('J06.0');
    expect(onSelectTerm).toHaveBeenCalledWith(TERMS[1]);
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('should close the list without choosing when Escape is pressed', async () => {
    const onSelectTerm = jest.fn();
    renderWithClient(<Harness onSelectTerm={onSelectTerm} />);
    const input = await typeAndWaitForList('J0');

    await userEvent.keyboard('{Escape}');

    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(onSelectTerm).not.toHaveBeenCalled();
  });

  it('should flag a code that does not match the ICD-10 mask when the field loses focus', async () => {
    renderWithClient(<Harness />);

    await userEvent.type(screen.getByRole('combobox'), 'bad');
    await userEvent.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('Некорректный код МКБ-10');
  });

  it('should not search the terminology before two characters are typed', async () => {
    renderWithClient(<Harness />);

    await userEvent.type(screen.getByRole('combobox'), 'J');

    expect(callsTo(apiFetchMock, '/api/v1/terminology/expand')).toHaveLength(0);
  });
});
