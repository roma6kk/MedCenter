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

describe('Icd10Combobox states of the search (A7)', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should say it is searching while the terminology has not answered', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => new Promise(() => undefined) }]);
    renderWithClient(<Harness />);

    await userEvent.type(screen.getByRole('combobox'), 'J06');

    expect(await screen.findByText('Ищем…')).toBeInTheDocument();
  });

  it('should say nothing was found, with the text searched, when the terminology has no match', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => ({ valueSet: 'icd10', total: 0, items: [] }) }]);
    renderWithClient(<Harness />);

    await userEvent.type(screen.getByRole('combobox'), 'zz9');

    expect(await screen.findByText('Ничего не найдено по «zz9»')).toBeInTheDocument();
    expect(screen.queryByText('Ищем…')).toBeNull();
  });

  it('should say the terminology is unavailable and offer a retry that asks again', async () => {
    let isDown = true;
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => { if (isDown) throw new Error('503'); return { valueSet: 'icd10', total: 3, items: TERMS }; } }]);
    renderWithClient(<Harness />);
    await userEvent.type(screen.getByRole('combobox'), 'J06');
    expect(await screen.findByText(/Справочник недоступен/)).toBeInTheDocument();
    const callsBefore: number = callsTo(apiFetchMock, '/api/v1/terminology/expand').length;

    isDown = false;
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByRole('listbox')).toBeVisible();
    expect(callsTo(apiFetchMock, '/api/v1/terminology/expand').length).toBeGreaterThan(callsBefore);
    expect(screen.queryByText(/Справочник недоступен/)).toBeNull();
  });

  it('should show nothing but the hint of the field before two characters are typed', async () => {
    renderWithClient(<Harness />);

    await userEvent.type(screen.getByRole('combobox'), 'J');

    expect(screen.queryByText('Ищем…')).toBeNull();
    expect(screen.queryByText(/Ничего не найдено/)).toBeNull();
  });
});

describe('Icd10Combobox with its own text and shortcuts', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => ({ valueSet: 'icd10', total: 3, items: TERMS }) }]);
  });

  function TextHarness({ onPick }: { readonly onPick?: (term: Term) => void }): ReactNode {
    const [text, setText] = useState('');
    return (
      <Icd10Combobox
        id="dx"
        label="Диагноз"
        value=""
        onChange={() => undefined}
        text={text}
        onTextChange={setText}
        onSelectTerm={onPick}
        shortcuts={[TERMS[2] as Term]}
        shortcutsLabel="Из истории пациента"
      />
    );
  }

  it('should show the text it is given and not the code', () => {
    renderWithClient(<Icd10Combobox id="dx" label="Диагноз" value="J06.9" onChange={() => undefined} text="J06.9 — Острый назофарингит" onTextChange={() => undefined} />);

    expect(screen.getByRole('combobox', { name: 'Диагноз' })).toHaveValue('J06.9 — Острый назофарингит');
  });

  it('should offer the shortcuts, under their caption, when the field is focused with nothing typed', async () => {
    renderWithClient(<TextHarness />);

    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByText('Из истории пациента')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /K21\.0/ })).toBeInTheDocument();
    expect(callsTo(apiFetchMock, '/api/v1/terminology/expand')).toHaveLength(0);
  });

  it('should hand a picked shortcut over like any suggestion', async () => {
    const onPick = jest.fn();
    renderWithClient(<TextHarness onPick={onPick} />);

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: /K21\.0/ }));

    expect(onPick).toHaveBeenCalledWith(TERMS[2]);
  });

  it('should leave the shortcuts once the doctor types, and search instead', async () => {
    renderWithClient(<TextHarness />);

    await userEvent.type(screen.getByRole('combobox'), 'J06');

    expect(await screen.findByRole('option', { name: /J06\.9/ })).toBeInTheDocument();
    expect(screen.queryByText('Из истории пациента')).toBeNull();
  });

  it('should flag a typed text that is no code once the field is left, asking to pick from the list', async () => {
    renderWithClient(<TextHarness />);

    await userEvent.type(screen.getByRole('combobox'), 'насморк');
    await userEvent.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('Выберите диагноз из списка');
  });
});
