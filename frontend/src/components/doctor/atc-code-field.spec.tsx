jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { createRef, useState } from 'react';
import type { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { AtcCodeField } from './atc-code-field';
import { callsTo, renderWithClient, routeApi, type ApiMock } from './doctor-test-utils';

const apiFetchMock = apiFetch as ApiMock;
const ATC_TERMS = [
  { system: 'http://www.whocc.no/atc', code: 'J01FA10', display: 'Азитромицин' },
  { system: 'http://www.whocc.no/atc', code: 'J01FA09', display: 'Кларитромицин' },
];

function Controlled({ onChange }: { readonly onChange?: (code: string) => void }): ReactNode {
  const [value, setValue] = useState('');
  return <AtcCodeField id="atc-test" value={value} onChange={(code) => { setValue(code); onChange?.(code); }} />;
}

describe('AtcCodeField', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => ({ valueSet: 'atc', total: 2, items: ATC_TERMS }) }]);
  });

  it('should upper-case the code as the user types', async () => {
    renderWithClient(<Controlled />);
    const input = screen.getByRole('combobox', { name: /Код АТХ/ });

    await userEvent.type(input, 'j01fa10');

    expect(input).toHaveValue('J01FA10');
  });

  it('should forward the ref to the input', () => {
    const ref = createRef<HTMLInputElement>();
    renderWithClient(<AtcCodeField ref={ref} id="atc-ref" value="" onChange={() => undefined} />);

    expect(ref.current).toBe(screen.getByRole('combobox'));
  });

  it('should flag a code that does not match the ATC mask when the field loses focus', async () => {
    renderWithClient(<Controlled />);

    await userEvent.type(screen.getByRole('combobox'), 'zz');
    await userEvent.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('Некорректный код АТХ');
  });

  it('should accept a valid 7-character code without an error message', async () => {
    renderWithClient(<Controlled />);

    await userEvent.type(screen.getByRole('combobox'), 'J01FA10');
    await userEvent.tab();

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('should limit the code to the 7 characters of an ATC code', async () => {
    renderWithClient(<Controlled />);
    const input = screen.getByRole('combobox');

    await userEvent.type(input, 'J01FA10999');

    expect(input).toHaveValue('J01FA10');
  });

  it('should search the atc value set and pick a suggestion with the mouse', async () => {
    const onChange = jest.fn();
    renderWithClient(<Controlled onChange={onChange} />);

    await userEvent.type(screen.getByRole('combobox'), 'J01');
    await userEvent.click(await screen.findByRole('option', { name: /J01FA09/ }));

    expect(onChange).toHaveBeenLastCalledWith('J01FA09');
    expect(callsTo(apiFetchMock, '/api/v1/terminology/expand').some(([path]) => path.includes('filter=J01') && path.includes('atc'))).toBe(true);
  });

  it('should show the drug name under the field after a suggestion is picked', async () => {
    renderWithClient(<Controlled />);

    await userEvent.type(screen.getByRole('combobox'), 'J01');
    await userEvent.click(await screen.findByRole('option', { name: /J01FA10/ }));

    expect(screen.getByText('Азитромицин')).toBeInTheDocument();
  });

  it('should tell the doctor the value set is unavailable when the terminology request fails', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => { throw new Error('offline'); } }]);
    renderWithClient(<Controlled />);

    await userEvent.type(screen.getByRole('combobox'), 'J01');

    expect(await screen.findByText(/Справочник недоступен/)).toBeInTheDocument();
  });

  it('should show the error given by the form instead of the mask message', async () => {
    renderWithClient(<AtcCodeField id="atc-err" value="J01FA10" onChange={() => undefined} error="Код АТХ не найден в справочнике" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Код АТХ не найден в справочнике');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
  });
});
